package cron

import (
	"fmt"
	"os"
	"strings"
	"time"
	"github.com/gin-gonic/gin"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"

	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/refund"
)

// StartMatchmakingExpiryCron checks for matchmaking sessions that failed to fill up before registration deadline
func StartMatchmakingExpiryCron() {
	// Run every 5 minutes
	ticker := time.NewTicker(5 * time.Minute)

	go func() {
		fmt.Println("[CRON] 🕒 Matchmaking Expiry Engine Started (Running every 5 mins)...")
		for {
			<-ticker.C
			processExpiredMatches()
		}
	}()
}

func processExpiredMatches() {
	var expiredMatches []models.Match

	now := time.Now()
	err := config.DB.Preload("Slot").Preload("Players").
		Where("status IN ? AND registration_end <= ?", []string{"open", "full"}, now).
		Find(&expiredMatches).Error

	if err != nil {
		fmt.Println("[CRON ERROR] Failed to fetch expired matches:", err)
		return
	}

	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeKey == "" {
		stripeKey = "sk_test_dummy_fallback"
	}
	stripe.Key = stripeKey

	for _, match := range expiredMatches {
		// If match is full and confirmed, don't expire
		if match.CurrentPlayers >= match.RequiredPlayers {
			match.Status = "confirmed"
			config.DB.Save(&match)
			continue
		}

		tx := config.DB.Begin()

		fmt.Printf("[CRON] ⚠️ Match #%d ('%s') failed to fill (%d/%d players). Processing expiry & refunds...\n",
			match.ID, match.Title, match.CurrentPlayers, match.RequiredPlayers)

		// 1. Mark match as expired
		match.Status = "expired"
		if err := tx.Save(&match).Error; err != nil {
			tx.Rollback()
			continue
		}

		// 2. Refund all paid players
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

		// 3. Release slot back to available
		if match.SlotID != 0 {
			var slot models.Slot
			if err := tx.First(&slot, match.SlotID).Error; err == nil {
				slot.IsBooked = false
				slot.HoldExpiresAt = nil
				slot.MatchmakingStatus = "failed"
				slot.CurrentPlayers = 0
				tx.Save(&slot)
			}
		}

		tx.Commit()

		fmt.Printf("[CRON] 🗑️ Released Slot #%d and refunded %d players for Match #%d.\n", match.SlotID, refundCount, match.ID)

		// Broadcast WS update
		go func() {
			websockets.EmitEvent("MATCHMAKING_UPDATED", "", 0, gin.H{
				"event":    "match_expired",
				"match_id": match.ID,
				"slot_id":  match.SlotID,
			})
		}()
	}
}
