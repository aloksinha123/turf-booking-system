package controllers

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
	"strings"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/paymentintent"
	"github.com/stripe/stripe-go/v78/refund"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CreateMatchRequest is the JSON body for creating a new match
type CreateMatchRequest struct {
	SlotID          uint   `json:"slot_id" binding:"required"`
	Title           string `json:"title" binding:"required"`
	Sport           string `json:"sport" binding:"required"`
	SkillLevel      string `json:"skill_level"`
	Visibility      string `json:"visibility"`
	RequiredPlayers int    `json:"required_players" binding:"required"`
}

// CreateMatch allows a user to create a public/private matchmaking session
func CreateMatch(c *gin.Context) {
	var req CreateMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	creatorID := userIDVal.(uint)

	if req.RequiredPlayers < 2 || req.RequiredPlayers > 22 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Required players must be between 2 and 22"})
		return
	}

	if req.SkillLevel == "" {
		req.SkillLevel = "any"
	}
	if req.Visibility == "" {
		req.Visibility = "public"
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var slot models.Slot
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Turf").First(&slot, req.SlotID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Slot not found"})
			return err
		}

		// Check slot is not already booked or held
		if slot.IsBooked || (slot.HoldExpiresAt != nil && slot.HoldExpiresAt.After(time.Now())) {
			c.JSON(http.StatusConflict, gin.H{"error": "This slot is already booked or being held"})
			return gorm.ErrDuplicatedKey
		}

		// Check no existing open match on this slot
		var existingMatch models.Match
		if err := tx.Where("slot_id = ? AND status IN ?", slot.ID, []string{"open", "full"}).First(&existingMatch).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "A match already exists for this slot"})
			return gorm.ErrDuplicatedKey
		}

		// Calculate price per player
		pricePerPlayer := slot.BasePrice / float64(req.RequiredPlayers)

		// Registration deadline = 1 hour before slot start time
		slotDate, _ := time.Parse("2006-01-02", slot.Date)
		parts := strings.Split(slot.StartTime, ":")
		hour, _ := strconv.Atoi(parts[0])
		min := 0
		if len(parts) > 1 {
			min, _ = strconv.Atoi(parts[1])
		}
		slotStart := time.Date(slotDate.Year(), slotDate.Month(), slotDate.Day(), hour, min, 0, 0, time.Local)
		registrationEnd := slotStart.Add(-1 * time.Hour)

		// Mark slot as held for matchmaking
		slot.MatchmakingStatus = "open_for_players"
		slot.RequiredPlayers = req.RequiredPlayers
		slot.CurrentPlayers = 1
		holdExpiry := registrationEnd
		slot.HoldExpiresAt = &holdExpiry
		if err := tx.Save(&slot).Error; err != nil {
			return err
		}

		match := models.Match{
			CreatorID:       creatorID,
			SlotID:          req.SlotID,
			Title:           req.Title,
			Sport:           req.Sport,
			SkillLevel:      req.SkillLevel,
			Visibility:      req.Visibility,
			RequiredPlayers: req.RequiredPlayers,
			CurrentPlayers:  1,
			PricePerPlayer:  pricePerPlayer,
			Status:          "open",
			RegistrationEnd: registrationEnd,
			CreatedAt:       time.Now(),
		}

		if err := tx.Create(&match).Error; err != nil {
			return err
		}

		// Generate Stripe PaymentIntent for the creator
		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			stripeKey = "sk_test_dummy_fallback"
		}
		stripe.Key = stripeKey

		var clientSecret string
		if stripeKey == "sk_test_dummy_fallback" {
			clientSecret = fmt.Sprintf("pi_%d_secret_mock%d", time.Now().UnixNano(), time.Now().UnixNano())
		} else {
			params := &stripe.PaymentIntentParams{
				Amount:   stripe.Int64(int64(pricePerPlayer * 100)),
				Currency: stripe.String(string(stripe.CurrencyINR)),
				AutomaticPaymentMethods: &stripe.PaymentIntentAutomaticPaymentMethodsParams{
					Enabled: stripe.Bool(true),
				},
			}
			params.AddMetadata("match_id", fmt.Sprintf("%d", match.ID))
			params.AddMetadata("match_player_creator", "true")
			pi, err := paymentintent.New(params)
			if err != nil {
				return err
			}
			clientSecret = pi.ClientSecret
		}

		// Add the creator as the first player
		creator := models.MatchPlayer{
			MatchID:            match.ID,
			UserID:             creatorID,
			Status:             "joined",
			IsCreator:          true,
			StripeClientSecret: clientSecret,
			JoinedAt:           time.Now(),
		}
		if err := tx.Create(&creator).Error; err != nil {
			return err
		}

		// Broadcast real-time update
		go func() {
			websockets.GlobalHub.Broadcast <- map[string]interface{}{
				"event":    "match_created",
				"match_id": match.ID,
				"slot_id":  slot.ID,
			}
		}()

		c.JSON(http.StatusCreated, gin.H{
			"message":        "Match created successfully!",
			"match":          match,
			"client_secret":  clientSecret,
			"price_per_player": pricePerPlayer,
		})

		return nil
	})

	if err != nil && err != gorm.ErrDuplicatedKey {
		fmt.Printf("[MATCH ERROR] Create failed: %v\n", err)
		if !c.IsAborted() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create match"})
		}
	}
}

// ListMatches returns all open public matches with optional filters
func ListMatches(c *gin.Context) {
	sport := c.Query("sport")
	date := c.Query("date")
	skillLevel := c.Query("skill_level")
	status := c.DefaultQuery("status", "open")
	search := c.Query("search")

	query := config.DB.Preload("Slot").Preload("Slot.Turf").Preload("Creator").Preload("Players").Preload("Players.User")

	// Only show public matches to non-admins
	query = query.Where("visibility = ?", "public")

	if status != "" {
		if status == "active" {
			query = query.Where("status IN ?", []string{"open", "full"})
		} else {
			query = query.Where("status = ?", status)
		}
	}
	if sport != "" {
		query = query.Where("sport = ?", sport)
	}
	if skillLevel != "" {
		query = query.Where("skill_level = ?", skillLevel)
	}
	if search != "" {
		query = query.Where("title ILIKE ?", "%"+search+"%")
	}
	if date != "" {
		query = query.Joins("JOIN slots ON slots.id = matches.slot_id").Where("slots.date = ?", date)
	}

	var matches []models.Match
	if err := query.Order("created_at desc").Find(&matches).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch matches"})
		return
	}

	c.JSON(http.StatusOK, matches)
}

// GetMatchDetails returns full match info with player list
func GetMatchDetails(c *gin.Context) {
	matchID := c.Param("id")

	var match models.Match
	if err := config.DB.Preload("Slot").Preload("Slot.Turf").Preload("Creator").Preload("Players").Preload("Players.User").First(&match, matchID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
		return
	}

	c.JSON(http.StatusOK, match)
}

// JoinMatch allows a player to join an open match with FOR UPDATE locking
func JoinMatch(c *gin.Context) {
	matchID := c.Param("id")

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var match models.Match
		// Lock the match row to prevent race conditions
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Slot").First(&match, matchID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
			return err
		}

		if match.Status != "open" {
			c.JSON(http.StatusConflict, gin.H{"error": "Match is no longer open for joining"})
			return gorm.ErrDuplicatedKey
		}

		if match.CurrentPlayers >= match.RequiredPlayers {
			c.JSON(http.StatusConflict, gin.H{"error": "Match is full"})
			return gorm.ErrDuplicatedKey
		}

		// Check if registration deadline has passed
		if time.Now().After(match.RegistrationEnd) {
			c.JSON(http.StatusConflict, gin.H{"error": "Registration deadline has passed"})
			return gorm.ErrDuplicatedKey
		}

		// Check if user already joined
		var existingPlayer models.MatchPlayer
		if err := tx.Where("match_id = ? AND user_id = ? AND status != 'cancelled'", match.ID, userID).First(&existingPlayer).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "You have already joined this match"})
			return gorm.ErrDuplicatedKey
		}

		// Generate Stripe PaymentIntent
		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			stripeKey = "sk_test_dummy_fallback"
		}
		stripe.Key = stripeKey

		var clientSecret string
		if stripeKey == "sk_test_dummy_fallback" {
			clientSecret = fmt.Sprintf("pi_%d_secret_mock%d", time.Now().UnixNano(), time.Now().UnixNano())
		} else {
			params := &stripe.PaymentIntentParams{
				Amount:   stripe.Int64(int64(match.PricePerPlayer * 100)),
				Currency: stripe.String(string(stripe.CurrencyINR)),
				AutomaticPaymentMethods: &stripe.PaymentIntentAutomaticPaymentMethodsParams{
					Enabled: stripe.Bool(true),
				},
			}
			params.AddMetadata("match_id", fmt.Sprintf("%d", match.ID))
			params.AddMetadata("user_id", fmt.Sprintf("%d", userID))
			pi, err := paymentintent.New(params)
			if err != nil {
				return err
			}
			clientSecret = pi.ClientSecret
		}

		// Create player entry
		player := models.MatchPlayer{
			MatchID:            match.ID,
			UserID:             userID,
			Status:             "joined",
			IsCreator:          false,
			StripeClientSecret: clientSecret,
			JoinedAt:           time.Now(),
		}
		if err := tx.Create(&player).Error; err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Failed to join — you may have already joined"})
			return err
		}

		// Increment player count
		match.CurrentPlayers++
		if match.CurrentPlayers >= match.RequiredPlayers {
			match.Status = "full"
		}

		// Also update slot
		match.Slot.CurrentPlayers = match.CurrentPlayers
		if err := tx.Save(&match.Slot).Error; err != nil {
			return err
		}

		if err := tx.Save(&match).Error; err != nil {
			return err
		}

		// Broadcast real-time update
		go func() {
			websockets.GlobalHub.Broadcast <- map[string]interface{}{
				"event":           "match_update",
				"match_id":        match.ID,
				"current_players": match.CurrentPlayers,
				"status":          match.Status,
				"player_name":     "",
				"action":          "joined",
			}
		}()

		c.JSON(http.StatusOK, gin.H{
			"message":          "Joined match successfully!",
			"client_secret":    clientSecret,
			"price_per_player": match.PricePerPlayer,
			"current_players":  match.CurrentPlayers,
			"match_status":     match.Status,
		})

		return nil
	})

	if err != nil && err != gorm.ErrDuplicatedKey {
		fmt.Printf("[MATCH ERROR] Join failed: %v\n", err)
		if !c.IsAborted() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join match"})
		}
	}
}

// LeaveMatch allows a player to leave before the match starts. Auto-refunds if paid.
func LeaveMatch(c *gin.Context) {
	matchID := c.Param("id")

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var match models.Match
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&match, matchID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
			return err
		}

		var player models.MatchPlayer
		if err := tx.Where("match_id = ? AND user_id = ? AND status IN ?", match.ID, userID, []string{"joined", "paid"}).First(&player).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "You are not part of this match"})
			return err
		}

		if player.IsCreator {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Creator cannot leave. Use cancel instead."})
			return fmt.Errorf("creator cannot leave")
		}

		// Refund if paid
		if player.Status == "paid" && player.StripeClientSecret != "" {
			stripeKey := os.Getenv("STRIPE_SECRET_KEY")
			if stripeKey != "" && stripeKey != "sk_test_dummy_fallback" {
				stripe.Key = stripeKey
				parts := strings.Split(player.StripeClientSecret, "_secret_")
				if len(parts) > 0 {
					_, _ = refund.New(&stripe.RefundParams{
						PaymentIntent: stripe.String(parts[0]),
					})
				}
			}
			player.Status = "refunded"
		} else {
			player.Status = "cancelled"
		}
		if err := tx.Save(&player).Error; err != nil {
			return err
		}

		// Decrement player count
		match.CurrentPlayers--
		if match.CurrentPlayers < 0 {
			match.CurrentPlayers = 0
		}
		if match.Status == "full" {
			match.Status = "open"
		}
		if err := tx.Save(&match).Error; err != nil {
			return err
		}

		// Update slot
		var slot models.Slot
		if err := tx.First(&slot, match.SlotID).Error; err == nil {
			slot.CurrentPlayers = match.CurrentPlayers
			tx.Save(&slot)
		}

		// Promote first waitlisted player
		var waitlisted models.MatchPlayer
		if err := tx.Where("match_id = ? AND status = 'waitlisted'", match.ID).Order("joined_at asc").First(&waitlisted).Error; err == nil {
			waitlisted.Status = "joined"
			tx.Save(&waitlisted)
			match.CurrentPlayers++
			tx.Save(&match)

			// Notify the promoted player
			go func() {
				websockets.GlobalHub.Broadcast <- map[string]interface{}{
					"event":    "match_waitlist_promoted",
					"match_id": match.ID,
					"user_id":  waitlisted.UserID,
				}
			}()
		}

		// Broadcast update
		go func() {
			websockets.GlobalHub.Broadcast <- map[string]interface{}{
				"event":           "match_update",
				"match_id":        match.ID,
				"current_players": match.CurrentPlayers,
				"status":          match.Status,
				"action":          "left",
			}
		}()

		c.JSON(http.StatusOK, gin.H{
			"message":         "Left match successfully",
			"current_players": match.CurrentPlayers,
		})

		return nil
	})

	if err != nil {
		if !c.IsAborted() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to leave match"})
		}
	}
}

// CancelMatch allows the creator to cancel the match and refund all paid players
func CancelMatch(c *gin.Context) {
	matchID := c.Param("id")

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var match models.Match
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Players").First(&match, matchID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
			return err
		}

		if match.CreatorID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Only the match creator can cancel"})
			return fmt.Errorf("not creator")
		}

		if match.Status == "cancelled" || match.Status == "expired" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Match is already cancelled or expired"})
			return fmt.Errorf("invalid status")
		}

		// Refund all paid players
		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			stripeKey = "sk_test_dummy_fallback"
		}
		stripe.Key = stripeKey

		refundCount := 0
		for i := range match.Players {
			if match.Players[i].Status == "paid" && match.Players[i].StripeClientSecret != "" {
				if stripeKey != "sk_test_dummy_fallback" {
					parts := strings.Split(match.Players[i].StripeClientSecret, "_secret_")
					if len(parts) > 0 {
						_, _ = refund.New(&stripe.RefundParams{
							PaymentIntent: stripe.String(parts[0]),
						})
					}
				}
				match.Players[i].Status = "refunded"
				refundCount++
			} else {
				match.Players[i].Status = "cancelled"
			}
			tx.Save(&match.Players[i])
		}

		// Cancel the match
		match.Status = "cancelled"
		if err := tx.Save(&match).Error; err != nil {
			return err
		}

		// Release the slot
		var slot models.Slot
		if err := tx.First(&slot, match.SlotID).Error; err == nil {
			slot.IsBooked = false
			slot.HoldExpiresAt = nil
			slot.MatchmakingStatus = "none"
			slot.CurrentPlayers = 0
			tx.Save(&slot)
		}

		// Broadcast
		go func() {
			websockets.GlobalHub.Broadcast <- map[string]interface{}{
				"event":    "match_cancelled",
				"match_id": match.ID,
				"slot_id":  match.SlotID,
			}
		}()

		c.JSON(http.StatusOK, gin.H{
			"message":       fmt.Sprintf("Match cancelled. %d players refunded.", refundCount),
			"refund_count":  refundCount,
		})

		return nil
	})

	if err != nil {
		if !c.IsAborted() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel match"})
		}
	}
}

// GetMatchPlayers returns the player list for a match
func GetMatchPlayers(c *gin.Context) {
	matchID := c.Param("id")

	var players []models.MatchPlayer
	if err := config.DB.Preload("User").Where("match_id = ?", matchID).Order("joined_at asc").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch players"})
		return
	}

	c.JSON(http.StatusOK, players)
}

// MatchPaymentWebhook handles payment confirmation for match players (called from HandlePaymentWebhook)
func ProcessMatchPayment(tx *gorm.DB, matchID uint, userID uint) {
	var player models.MatchPlayer
	if err := tx.Where("match_id = ? AND user_id = ?", matchID, userID).First(&player).Error; err != nil {
		fmt.Printf("[MATCH PAYMENT ERROR] Player not found: match=%d user=%d\n", matchID, userID)
		return
	}

	player.Status = "paid"
	tx.Save(&player)

	// Check if all players are paid
	var match models.Match
	if err := tx.Preload("Players").Preload("Slot").First(&match, matchID).Error; err != nil {
		return
	}

	allPaid := true
	for _, p := range match.Players {
		if p.Status != "paid" && p.Status != "refunded" && p.Status != "cancelled" {
			allPaid = false
			break
		}
	}

	// Count active paid players
	paidCount := 0
	for _, p := range match.Players {
		if p.Status == "paid" {
			paidCount++
		}
	}

	if allPaid && paidCount >= match.RequiredPlayers {
		match.Status = "confirmed"
		match.Slot.IsBooked = true
		match.Slot.MatchmakingStatus = "closed"
		tx.Save(&match.Slot)
		tx.Save(&match)

		fmt.Printf("[MATCH] ✅ Match #%d confirmed! All %d players paid.\n", match.ID, paidCount)
	}

	// Broadcast update
	go func() {
		websockets.GlobalHub.Broadcast <- map[string]interface{}{
			"event":           "match_update",
			"match_id":        match.ID,
			"current_players": match.CurrentPlayers,
			"paid_count":      paidCount,
			"status":          match.Status,
			"action":          "payment",
		}
	}()
}

// GetUserMatches returns matches where the current user is a player
func GetUserMatches(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDVal.(uint)

	var playerEntries []models.MatchPlayer
	if err := config.DB.Where("user_id = ?", userID).Find(&playerEntries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch your matches"})
		return
	}

	var matchIDs []uint
	for _, p := range playerEntries {
		matchIDs = append(matchIDs, p.MatchID)
	}

	if len(matchIDs) == 0 {
		c.JSON(http.StatusOK, []models.Match{})
		return
	}

	var matches []models.Match
	if err := config.DB.Preload("Slot").Preload("Slot.Turf").Preload("Creator").Preload("Players").Preload("Players.User").Where("id IN ?", matchIDs).Order("created_at desc").Find(&matches).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch matches"})
		return
	}

	c.JSON(http.StatusOK, matches)
}

// AdminListMatches returns all matches for admin dashboard
func AdminListMatches(c *gin.Context) {
	var matches []models.Match
	if err := config.DB.Preload("Slot").Preload("Slot.Turf").Preload("Creator").Preload("Players").Preload("Players.User").Order("created_at desc").Find(&matches).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch matches"})
		return
	}

	c.JSON(http.StatusOK, matches)
}

// AdminCancelMatch lets an admin cancel any match
func AdminCancelMatch(c *gin.Context) {
	matchID := c.Param("id")

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var match models.Match
		if err := tx.Preload("Players").First(&match, matchID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Match not found"})
			return err
		}

		if match.Status == "cancelled" || match.Status == "expired" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Match is already cancelled or expired"})
			return fmt.Errorf("invalid status")
		}

		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			stripeKey = "sk_test_dummy_fallback"
		}
		stripe.Key = stripeKey

		refundCount := 0
		for i := range match.Players {
			if match.Players[i].Status == "paid" {
				if stripeKey != "sk_test_dummy_fallback" && match.Players[i].StripeClientSecret != "" {
					parts := strings.Split(match.Players[i].StripeClientSecret, "_secret_")
					if len(parts) > 0 {
						_, _ = refund.New(&stripe.RefundParams{
							PaymentIntent: stripe.String(parts[0]),
						})
					}
				}
				match.Players[i].Status = "refunded"
				refundCount++
			} else {
				match.Players[i].Status = "cancelled"
			}
			tx.Save(&match.Players[i])
		}

		match.Status = "cancelled"
		tx.Save(&match)

		// Release slot
		var slot models.Slot
		if err := tx.First(&slot, match.SlotID).Error; err == nil {
			slot.IsBooked = false
			slot.HoldExpiresAt = nil
			slot.MatchmakingStatus = "none"
			slot.CurrentPlayers = 0
			tx.Save(&slot)
		}

		go func() {
			websockets.GlobalHub.Broadcast <- map[string]interface{}{
				"event":    "match_cancelled",
				"match_id": match.ID,
				"slot_id":  match.SlotID,
			}
		}()

		c.JSON(http.StatusOK, gin.H{
			"message":      fmt.Sprintf("Match #%s cancelled by admin. %d players refunded.", matchID, refundCount),
			"refund_count": refundCount,
		})
		return nil
	})

	if err != nil {
		if !c.IsAborted() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel match"})
		}
	}
}
