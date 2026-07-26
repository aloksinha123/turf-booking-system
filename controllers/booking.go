package controllers

import (
	"fmt"
	"net/http"
	"os"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/services"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/paymentintent"
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

		if err := tx.Create(&booking).Error; err != nil {
			return err
		}

		// STRIPE: Create PaymentIntent FIRST so we can attach its client_secret to split tokens
		stripeKey := os.Getenv("STRIPE_SECRET_KEY")
		if stripeKey == "" {
			stripeKey = os.Getenv("STRIPE_SECRET_KEY")
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

		pi, err := paymentintent.New(params)
		if err != nil {
			return err // Will trigger rollback
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
			"client_secret":   pi.ClientSecret,
			"split_tokens":    tokens,
			// Return original (pre-dynamic) slot base price so frontend can display accurate strike-through
			"original_price":  slot.BasePrice,
			"final_price":     finalPrice,
		})

		return nil // Commit happens automatically if nil is returned
	})

	if err != nil && err != gorm.ErrDuplicatedKey {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction runtime failed to complete safely"})
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
	if err := config.DB.Preload("Slot").Where("user_id = ?", userID).Order("booked_at desc").Find(&bookings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookings"})
		return
	}

	c.JSON(http.StatusOK, bookings)
}
