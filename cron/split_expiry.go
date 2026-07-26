package cron

import (
	"fmt"
	"strings"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"

	"os"

	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/refund"
)

// StartSplitExpiryCron initializes a background ticker that checks for expired splits
func StartSplitExpiryCron() {
	// Run every 5 minutes
	ticker := time.NewTicker(5 * time.Minute)

	go func() {
		fmt.Println("[CRON] 🕒 Split Expiry Engine Started (Running every 5 mins)...")
		for {
			<-ticker.C
			processExpiredSplits()
		}
	}()
}

func processExpiredSplits() {
	var expiredBookings []models.Booking

	// Calculate timestamp 30 minutes ago
	cutoffTime := time.Now().Add(-30 * time.Minute)

	// Find all pending/processing split bookings older than 30 minutes
	err := config.DB.Preload("Slot").
		Where("status IN ? AND is_split = ? AND booked_at < ?", []string{"pending", "processing"}, true, cutoffTime).
		Find(&expiredBookings).Error

	if err != nil {
		fmt.Println("[CRON ERROR] Failed to fetch expired splits:", err)
		return
	}

	for _, b := range expiredBookings {
		// Start a database transaction for safe updates
		tx := config.DB.Begin()

		// 1. Mark booking as expired
		b.Status = "expired"
		b.SplitStatus = "expired"
		if err := tx.Save(&b).Error; err != nil {
			tx.Rollback()
			continue
		}

		// 2. Release the Turf Slot back to available
		if b.SlotID != 0 {
			var slot models.Slot
			if err := tx.First(&slot, b.SlotID).Error; err == nil {
				slot.IsBooked = false
				slot.HoldExpiresAt = nil
				if err := tx.Save(&slot).Error; err != nil {
					tx.Rollback()
					continue
				}
			}
		}

		// 3. Trigger Stripe Refunds for any friend who actually paid
		var splits []models.BookingSplit
		if err := tx.Where("booking_id = ?", b.ID).Find(&splits).Error; err == nil {
			stripe.Key = os.Getenv("STRIPE_SECRET_KEY")

			for _, split := range splits {
				if split.Status == "paid" && split.StripeClientSecret != "" {
					// Extract PaymentIntent ID from ClientSecret (pi_123_secret_abc -> pi_123)
					parts := strings.Split(split.StripeClientSecret, "_secret_")
					if len(parts) > 0 {
						piID := parts[0]
						params := &stripe.RefundParams{
							PaymentIntent: stripe.String(piID),
						}
						// Issue Refund via Stripe API
						_, err := refund.New(params)
						if err != nil {
							fmt.Printf("[CRON ERROR] Failed to refund %s: %v\n", piID, err)
						} else {
							fmt.Printf("[CRON INFO] Successfully refunded %s\n", piID)
						}
					}
				}
			}
		}

		// Also refund the primary user if they paid
		if b.PrimaryPaid && b.StripeClientSecret != "" {
			parts := strings.Split(b.StripeClientSecret, "_secret_")
			if len(parts) > 0 {
				piID := parts[0]
				params := &stripe.RefundParams{
					PaymentIntent: stripe.String(piID),
				}
				_, err := refund.New(params)
				if err != nil {
					fmt.Printf("[CRON ERROR] Failed to refund Primary PI %s: %v\n", piID, err)
				} else {
					fmt.Printf("[CRON INFO] Successfully refunded Primary PI %s\n", piID)
				}
			}
		}

		// 4. Invalidate all associated BookingSplits (WhatsApp links)
		if err := tx.Model(&models.BookingSplit{}).
			Where("booking_id = ?", b.ID).
			Update("status", "expired").Error; err != nil {
			tx.Rollback()
			continue
		}

		// Commit transaction
		tx.Commit()
		fmt.Printf("[CRON] 🗑️ Automatically released expired split for Booking #%d\n", b.ID)
	}
}
