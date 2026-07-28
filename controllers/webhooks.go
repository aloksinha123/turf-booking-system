package controllers

import (
	"fmt"
	"net/http"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/services"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// checkAndFinalizeSplit accepts an optional tx (*gorm.DB); if nil, uses config.DB.
// Wrapping saves in a single transaction prevents slot/booking state inconsistency.
func checkAndFinalizeSplit(db *gorm.DB, booking *models.Booking) {
	if db == nil {
		db = config.DB
	}
	var splits []models.BookingSplit
	db.Where("booking_id = ?", booking.ID).Find(&splits)

	allPaid := true
	for _, s := range splits {
		fmt.Printf("[DEBUG] Split %d status: %s\n", s.ID, s.Status)
		if s.Status != "paid" {
			allPaid = false
			break
		}
	}

	fmt.Printf("[DEBUG] PrimaryPaid: %t\n", booking.PrimaryPaid)
	if !booking.PrimaryPaid {
		allPaid = false
	}
    
    fmt.Printf("[DEBUG] allPaid resolved to: %t\n", allPaid)

	if allPaid {
		_ = db.Transaction(func(tx *gorm.DB) error {
			booking.SplitStatus = "fully_paid"
			booking.Status = "confirmed"
			booking.Slot.IsBooked = true
			booking.Slot.HoldExpiresAt = nil

			if booking.IsMatchmaking {
				booking.Slot.MatchmakingStatus = "open_for_players"
				booking.Slot.RequiredPlayers = 10
				booking.Slot.CurrentPlayers = 1
				booking.Slot.IsBooked = false // Remains open for joins
			} else if booking.IsMatchmakingJoin {
				booking.Slot.CurrentPlayers += 1
				if booking.Slot.CurrentPlayers >= booking.Slot.RequiredPlayers {
					booking.Slot.IsBooked = true
					booking.Slot.MatchmakingStatus = "closed"
				} else {
					booking.Slot.IsBooked = false // Still open
				}
			}

			if err := tx.Save(&booking.Slot).Error; err != nil {
				return err
			}
			if err := tx.Save(booking).Error; err != nil {
				return err
			}

			// Fire WhatsApp Invoice
			services.SendBookingInvoice(booking)

			// Broadcast real-time slot update to all connected WebSocket clients
			go func() {
				websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
					"event":   "slot_update",
					"slot_id": booking.SlotID,
					"turf_id": booking.Slot.TurfID,
				})
			}()
			return nil
		})
	}
}

type WebhookRequest struct {
	EventID        string `json:"event_id"`
	BookingID      uint   `json:"booking_id"`
	Status         string `json:"status"`
	SplitToken     string `json:"split_token"`
	IsPrimarySplit bool   `json:"is_primary_split"`
	MatchID        uint   `json:"match_id"`
	UserID         uint   `json:"user_id"`
}

// HandleStripeWebhook handles official Stripe events
func HandleStripeWebhook(c *gin.Context) {
	// For production, you MUST verify the signature using endpointSecret
	// payload, err := ioutil.ReadAll(c.Request.Body)
	// event, err := webhook.ConstructEvent(payload, c.Request.Header.Get("Stripe-Signature"), endpointSecret)
	
	// For development, we will just parse the JSON directly
	var event struct {
		Type string `json:"type"`
		Data struct {
			Object struct {
				Metadata struct {
					BookingID      string `json:"booking_id"`
					SplitToken     string `json:"split_token"`
					IsPrimarySplit string `json:"is_primary_split"`
				} `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}

	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if event.Type == "payment_intent.succeeded" || event.Type == "payment_intent.payment_failed" {
		var booking models.Booking
		if err := config.DB.Preload("Slot").Preload("User").First(&booking, event.Data.Object.Metadata.BookingID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
			return
		}

		if event.Type == "payment_intent.succeeded" {
			if event.Data.Object.Metadata.SplitToken != "" {
				// A friend paid their split
				config.DB.Model(&models.BookingSplit{}).Where("token = ?", event.Data.Object.Metadata.SplitToken).Update("status", "paid")
				checkAndFinalizeSplit(nil, &booking)
				
				// Broadcast split progress update to the host
				go func() {
					websockets.EmitEvent("SPLIT_UPDATED", "", 0, gin.H{
						"event":      "split_update",
						"booking_id": booking.ID,
					})
				}()
			} else if event.Data.Object.Metadata.IsPrimarySplit == "true" {
				// Primary user paid their share
				booking.PrimaryPaid = true
				config.DB.Save(&booking)
				
				if booking.IsMatchmaking {
					booking.Slot.MatchmakingStatus = "open_for_players"
					booking.Slot.RequiredPlayers = 10
					booking.Slot.CurrentPlayers = 1
					booking.Slot.IsBooked = false
					config.DB.Save(&booking.Slot)

					go func() {
						websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
							"event":   "slot_update",
							"slot_id": booking.SlotID,
							"turf_id": booking.Slot.TurfID,
						})
					}()
				}

				// Wait for others
				checkAndFinalizeSplit(nil, &booking)
			} else {
				// Normal full booking payment succeeded
				booking.Status = "confirmed"
				booking.Slot.HoldExpiresAt = nil
				booking.Slot.IsBooked = true
				
				if booking.IsMatchmaking {
					booking.Slot.MatchmakingStatus = "open_for_players"
					booking.Slot.RequiredPlayers = 10
					booking.Slot.CurrentPlayers = 1
					booking.Slot.IsBooked = false
				} else if booking.IsMatchmakingJoin {
					booking.Slot.CurrentPlayers += 1
					if booking.Slot.CurrentPlayers >= booking.Slot.RequiredPlayers {
						booking.Slot.IsBooked = true
						booking.Slot.MatchmakingStatus = "closed"
					} else {
						booking.Slot.IsBooked = false
					}
				}

			config.DB.Save(&booking.Slot)
			config.DB.Save(&booking)

			// Broadcast real-time update
			go func() {
				websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
					"event":   "slot_update",
					"slot_id": booking.SlotID,
					"turf_id": booking.Slot.TurfID,
				})
			}()
			// Fire WhatsApp Invoice
			services.SendBookingInvoice(&booking)
		}
		} else {
			// Payment failed logic (simplified)
			if event.Data.Object.Metadata.SplitToken == "" && event.Data.Object.Metadata.IsPrimarySplit != "true" {
				booking.Status = "failed"
				booking.Slot.HoldExpiresAt = nil
				config.DB.Save(&booking.Slot)
				config.DB.Save(&booking)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"received": true})
}

// HandlePaymentWebhook handles payment events with idempotency verification and automated QR ticket generation
func HandlePaymentWebhook(c *gin.Context) {
	var req WebhookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook payload"})
		return
	}

	eventID := req.EventID
	if eventID == "" {
		eventID = fmt.Sprintf("evt_mock_%d_%d", req.BookingID, time.Now().UnixNano())
	}

	// 1. Idempotency Check: Prevent duplicate webhook processing
	var existingEvent models.WebhookEvent
	if err := config.DB.Where("event_id = ?", eventID).First(&existingEvent).Error; err == nil {
		fmt.Printf("[WEBHOOK ENGINE] 🛑 Duplicate event #%s skipped via idempotency check.\n", eventID)
		c.JSON(http.StatusOK, gin.H{
			"message": "Duplicate webhook event skipped (Idempotency verified 🟢)",
			"status":  "duplicate_skipped",
		})
		return
	}

	// Record incoming webhook event
	webhookRecord := models.WebhookEvent{
		EventID:     eventID,
		EventType:   "payment.updated",
		Status:      "processed",
		Payload:     fmt.Sprintf("BookingID: %d, Status: %s", req.BookingID, req.Status),
		ProcessedAt: time.Now(),
	}
	config.DB.Create(&webhookRecord)

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		if req.MatchID != 0 {
			ProcessMatchPayment(tx, req.MatchID, req.UserID)
			c.JSON(http.StatusOK, gin.H{
				"message": "Match payment processed successfully",
			})
			return nil
		}

		var booking models.Booking
		if err := tx.Preload("Slot").Preload("User").First(&booking, req.BookingID).Error; err != nil {
			return err
		}

		if req.Status == "success" {
			if req.SplitToken != "" {
				// Friend paid their share in mock flow
				tx.Model(&models.BookingSplit{}).Where("token = ?", req.SplitToken).Update("status", "paid")
				checkAndFinalizeSplit(tx, &booking)
				
				// Broadcast split progress update to the host
				go func() {
					websockets.EmitEvent("SPLIT_UPDATED", "", 0, gin.H{
						"event":      "split_update",
						"booking_id": booking.ID,
					})
				}()
			} else if req.IsPrimarySplit {
				// Primary user paid their share
				booking.PrimaryPaid = true
				tx.Save(&booking)

				if booking.IsMatchmaking {
					booking.Slot.MatchmakingStatus = "open_for_players"
					booking.Slot.RequiredPlayers = 10
					booking.Slot.CurrentPlayers = 1
					booking.Slot.IsBooked = false
					tx.Save(&booking.Slot)

					go func() {
						websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
							"event":   "slot_update",
							"slot_id": booking.SlotID,
							"turf_id": booking.Slot.TurfID,
						})
					}()
				}

				checkAndFinalizeSplit(tx, &booking)
			} else {
				// Normal full booking or matchmaking
				booking.Status = "confirmed"
				booking.Slot.HoldExpiresAt = nil
				booking.Slot.IsBooked = true
				
				if booking.IsMatchmaking {
					booking.Slot.MatchmakingStatus = "open_for_players"
					booking.Slot.RequiredPlayers = 10
					booking.Slot.CurrentPlayers = 1
					booking.Slot.IsBooked = false
				} else if booking.IsMatchmakingJoin {
					booking.Slot.CurrentPlayers += 1
					if booking.Slot.CurrentPlayers >= booking.Slot.RequiredPlayers {
						booking.Slot.IsBooked = true
						booking.Slot.MatchmakingStatus = "closed"
					} else {
						booking.Slot.IsBooked = false
					}
				}

				// Broadcast real-time slot update to all connected WebSocket clients
				go func() {
					websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
						"event":   "slot_update",
						"slot_id": booking.SlotID,
						"turf_id": booking.Slot.TurfID,
					})
				}()
				services.SendBookingInvoice(&booking)

				// Generate Automated Digital Ticket & Unique QR Code
				services.GenerateDigitalTicket(booking.ID)

				// Log Payment Transaction Ledger
				txRecord := models.PaymentTransaction{
					BookingID:             booking.ID,
					UserID:                booking.UserID,
					StripePaymentIntentID: fmt.Sprintf("pi_%s", eventID),
					Amount:                booking.FinalAmount,
					Currency:              "INR",
					Status:                "succeeded",
					PaymentMethod:         "card",
					Timeline:              "Created -> Processing -> Succeeded",
					CreatedAt:             time.Now(),
				}
				tx.Create(&txRecord)
			}
		} else {
			if req.SplitToken == "" && !req.IsPrimarySplit {
				booking.Status = "failed"
				booking.Slot.HoldExpiresAt = nil

				// Log Failed Payment Transaction Ledger
				txRecord := models.PaymentTransaction{
					BookingID:             booking.ID,
					UserID:                booking.UserID,
					StripePaymentIntentID: fmt.Sprintf("pi_failed_%s", eventID),
					Amount:                booking.FinalAmount,
					Currency:              "INR",
					Status:                "failed",
					PaymentMethod:         "card",
					Timeline:              "Created -> Processing -> Failed",
					CreatedAt:             time.Now(),
				}
				tx.Create(&txRecord)
			}
		}

		if err := tx.Save(&booking.Slot).Error; err != nil {
			return err
		}
		
		if err := tx.Save(&booking).Error; err != nil {
			return err
		}

		c.JSON(http.StatusOK, gin.H{
			"message":        "Webhook processed successfully (Idempotency verified 🟢)",
			"event_id":       eventID,
			"booking_status": booking.Status,
		})

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process webhook transaction"})
	}
}
