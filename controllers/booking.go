package controllers

import (
	"fmt"
	"net/http"
	"os"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/services"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/paymentintent"
	"github.com/stripe/stripe-go/v78/refund"
	"strings"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type BookingRequest struct {
	UserID        uint `json:"user_id" binding:"required"`
	SlotID        uint `json:"slot_id" binding:"required"`
	IsSplit       bool `json:"is_split"`
	FriendsCount      int  `json:"friends_count"`
	IsMatchmaking     bool `json:"is_matchmaking"`
	IsMatchmakingJoin bool `json:"is_matchmaking_join"`
}

// CreateBooking handles concurrent multi-user checkout scenarios safely
func CreateBooking(c *gin.Context) {
	var req BookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload parameters"})
		return
	}

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized access"})
		return
	}
	userID := userIDVal.(uint)

	idempotencyKey := c.GetHeader("Idempotency-Key")
	if idempotencyKey != "" {
		var existingBooking models.Booking
		if err := config.DB.Where("idempotency_key = ? AND user_id = ?", idempotencyKey, userID).First(&existingBooking).Error; err == nil {
			var tokens []string
			if existingBooking.IsSplit {
				var splits []models.BookingSplit
				config.DB.Where("booking_id = ?", existingBooking.ID).Find(&splits)
				for _, s := range splits {
					tokens = append(tokens, s.Token)
				}
			}
			c.JSON(http.StatusOK, gin.H{
				"message":         "Booking retrieved idempotently.",
				"booking_details": existingBooking,
				"client_secret":   existingBooking.StripeClientSecret,
				"split_tokens":    tokens,
			})
			return
		}
	}

	// Industrial Core Concept: PostgreSQL Transaction Level Locking
	// Hamein 'BEGIN TRANSACTION' block deploy karna hoga taaki simultaneous bookings handle ho sakein
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var slot models.Slot

		// GORM v2: clause.Locking runs SELECT ... FOR UPDATE atomically.
		// Yeh specific slot row ko lock kar deta hai taaki doosra user is millisecond par ise change na kar sake.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&slot, req.SlotID).Error; err != nil {
			return err
		}

		// Agar turf slot permanently booked hai ya kisi aur user ne temporary hold (10 min) pe rakha hai
		if req.IsMatchmakingJoin {
			if slot.MatchmakingStatus != "open_for_players" || slot.CurrentPlayers >= slot.RequiredPlayers {
				c.JSON(http.StatusConflict, gin.H{"error": "Match is full or no longer open for joining"})
				return gorm.ErrDuplicatedKey
			}
		} else {
			if slot.IsBooked || (slot.HoldExpiresAt != nil && slot.HoldExpiresAt.After(time.Now())) {
				c.JSON(http.StatusConflict, gin.H{"error": "This slot is currently being processed or already booked by someone else"})
				return gorm.ErrDuplicatedKey // Abort the transaction cleanly
			}
		}

		// Calculate final price using our existing dynamic pricing helper index logic
		weatherMultiplier, _ := services.GetWeatherMultiplier()
		
		weekendMultiplier := 1.0
		today := time.Now().Weekday()
		if today == time.Saturday || today == time.Sunday {
			weekendMultiplier = 1.3
		}

		finalPrice := CalculateDynamicPrice(slot.BasePrice, slot.StartTime, weatherMultiplier, weekendMultiplier)

		// 1. Slot hold status update pipeline
		var expires time.Time
		if req.IsSplit {
			expires = time.Now().Add(30 * time.Minute)
		} else {
			expires = time.Now().Add(10 * time.Minute)
		}
		
		if !req.IsMatchmakingJoin {
			slot.HoldExpiresAt = &expires
		}

		if err := tx.Save(&slot).Error; err != nil {
			return err
		}

		// 2. Booking entry generate karein ledger schema me (Status: pending)
		booking := models.Booking{
			UserID:      userID,
			SlotID:      req.SlotID,
			FinalAmount:       finalPrice,
			Status:            "pending",
			IsSplit:           req.IsSplit,
			IsMatchmaking:     req.IsMatchmaking,
			IsMatchmakingJoin: req.IsMatchmakingJoin,
			SplitStatus:       "none",
			BookedAt:          time.Now(),
		}
		if req.IsSplit {
			booking.SplitStatus = "pending"
		}

		if idempotencyKey != "" {
			booking.IdempotencyKey = idempotencyKey
		}

		if err := tx.Create(&booking).Error; err != nil {
			return err
		}

		// STRIPE: Create PaymentIntent FIRST so we can attach its client_secret to split tokens
		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			stripeKey = "sk_test_dummy_fallback" // Hardcoded fallback for local dev
		}
		stripe.Key = stripeKey
		
		chargeAmount := finalPrice
		if req.IsSplit {
			chargeAmount = finalPrice / float64(req.FriendsCount+1)
		} else if req.IsMatchmakingJoin {
			chargeAmount = finalPrice / float64(slot.RequiredPlayers)
		}

		params := &stripe.PaymentIntentParams{
			Amount:   stripe.Int64(int64(chargeAmount * 100)), // Convert to paise
			Currency: stripe.String(string(stripe.CurrencyINR)),
			AutomaticPaymentMethods: &stripe.PaymentIntentAutomaticPaymentMethodsParams{
				Enabled: stripe.Bool(true),
			},
		}
		params.AddMetadata("booking_id", fmt.Sprintf("%d", booking.ID))
		if req.IsSplit {
			params.AddMetadata("is_primary_split", "true")
		}

		var clientSecret string
		if stripeKey == "sk_test_dummy_fallback" {
			clientSecret = fmt.Sprintf("pi_%d_secret_mock%d", time.Now().UnixNano(), time.Now().UnixNano())
		} else {
			pi, err := paymentintent.New(params)
			if err != nil {
				return err // Will trigger rollback
			}
			clientSecret = pi.ClientSecret
		}
		
		// Update Booking with Client Secret for future idempotent requests
		booking.StripeClientSecret = clientSecret
		if err := tx.Save(&booking).Error; err != nil {
			return err
		}

		// 3. Generate tokens for friends if it's a split
		if req.IsSplit {
			totalPeople := req.FriendsCount + 1
			shareAmount := finalPrice / float64(totalPeople)
			for i := 1; i <= req.FriendsCount; i++ {
				token := fmt.Sprintf("SPLIT-%d-%d", booking.ID, time.Now().UnixNano()+int64(i))
				splitEntry := models.BookingSplit{
					BookingID:   booking.ID,
					Token:       token,
					ShareAmount: shareAmount,
					Status:      "pending",
					// We do NOT save StripeClientSecret here. It will be generated on-the-fly when the friend opens the link.
				}
				if err := tx.Create(&splitEntry).Error; err != nil {
					return err
				}
			}
		}

		// Status successfully saved! Send response back to frontend grid
		
		// If split, return tokens as well
		var tokens []string
		if req.IsSplit {
			var splits []models.BookingSplit
			tx.Where("booking_id = ?", booking.ID).Find(&splits)
			for _, s := range splits {
				tokens = append(tokens, s.Token)
			}
		}

		c.JSON(http.StatusCreated, gin.H{
			"message":         "Slot held successfully. Please complete payment.",
			"booking_details": booking,
			"hold_expires_at": expires,
			"client_secret":   clientSecret,
			"split_tokens":    tokens,
			// Return original (pre-dynamic) slot base price so frontend can display accurate strike-through
			"original_price":  slot.BasePrice,
			"final_price":     finalPrice,
		})

		return nil // Commit happens automatically if nil is returned
	})

	if err != nil && err != gorm.ErrDuplicatedKey {
		fmt.Printf("[BOOKING ERROR] Transaction failed: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction runtime failed to complete safely: " + err.Error()})
	}
}

// GetUserBookings fetches all bookings for the currently authenticated user
func GetUserBookings(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized access"})
		return
	}
	userID := userIDVal.(uint)

	var bookings []models.Booking
	if err := config.DB.Preload("Slot").Preload("Splits").Where("user_id = ?", userID).Order("booked_at desc").Find(&bookings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookings"})
		return
	}

	c.JSON(http.StatusOK, bookings)
}

// CancelBooking allows the host to manually cancel a pending split booking and get their share refunded immediately
func CancelBooking(c *gin.Context) {
	bookingID := c.Param("id")
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized access"})
		return
	}
	userID := userIDVal.(uint)

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var booking models.Booking
		if err := tx.Preload("Slot").Where("id = ? AND user_id = ?", bookingID, userID).First(&booking).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found or not owned by you"})
			return err
		}

		if booking.Status != "pending" || !booking.IsSplit {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Only pending split bookings can be cancelled"})
			return fmt.Errorf("invalid status")
		}

		// Update booking status
		booking.Status = "cancelled"
		if err := tx.Save(&booking).Error; err != nil {
			return err
		}

		// Release the slot
		var slot models.Slot
		if err := tx.First(&slot, booking.SlotID).Error; err == nil {
			slot.IsBooked = false
			slot.HoldExpiresAt = nil
			if err := tx.Save(&slot).Error; err != nil {
				return err
			}
		}

		// Refund paid fractions
		var splits []models.BookingSplit
		if err := tx.Where("booking_id = ?", booking.ID).Find(&splits).Error; err == nil {
			stripeKey := os.Getenv("STRIPE_SECRET_KEY")
			stripe.Key = stripeKey

			for _, split := range splits {
				if split.Status == "paid" && split.StripeClientSecret != "" {
					parts := strings.Split(split.StripeClientSecret, "_secret_")
					if len(parts) > 0 {
						piID := parts[0]
						params := &stripe.RefundParams{
							PaymentIntent: stripe.String(piID),
						}
						// Issue Refund via Stripe API
						_, err := refund.New(params)
						if err == nil {
							split.Status = "refunded"
							tx.Save(&split)
						}
					}
				}
			}
		}

		// Refund the primary user if they have already paid
		if booking.PrimaryPaid && booking.StripeClientSecret != "" {
			parts := strings.Split(booking.StripeClientSecret, "_secret_")
			if len(parts) > 0 {
				piID := parts[0]
				params := &stripe.RefundParams{
					PaymentIntent: stripe.String(piID),
				}
				_, err := refund.New(params)
				if err != nil {
					fmt.Printf("[CancelBooking ERROR] Failed to refund Primary PI %s: %v\n", piID, err)
				}
			}
		}

		// Broadcast to WebSockets
		websockets.GlobalHub.Broadcast <- map[string]interface{}{
			"type":    "SLOT_UPDATE",
			"slot_id": booking.SlotID,
			"status":  "available",
		}

		return nil
	})

	if err != nil {
		if !c.IsAborted() {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel booking"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Booking cancelled and refunded successfully"})
}
