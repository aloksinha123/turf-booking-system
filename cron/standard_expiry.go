package cron

import (
	"fmt"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"
)

// StartStandardExpiryCron initializes a background ticker that checks for expired 10-minute holds
func StartStandardExpiryCron() {
	// Run every 1 minute
	ticker := time.NewTicker(1 * time.Minute)

	go func() {
		fmt.Println("[CRON] 🕒 Standard Hold Expiry Engine Started (Running every 1 min)...")
		for {
			<-ticker.C
			processExpiredHolds()
		}
	}()
}

func processExpiredHolds() {
	var expiredSlots []models.Slot

	// Find slots where the hold has expired and is still marked as booked
	err := config.DB.Where("is_booked = ? AND hold_expires_at IS NOT NULL AND hold_expires_at < ?", true, time.Now()).Find(&expiredSlots).Error
	if err != nil {
		fmt.Println("[CRON ERROR] Failed to fetch expired holds:", err)
		return
	}

	for _, slot := range expiredSlots {
		// Begin a transaction to safely release the slot and handle waitlist
		tx := config.DB.Begin()
		
		// Mark any pending booking as cancelled
		tx.Exec("UPDATE bookings SET status = 'cancelled' WHERE slot_id = ? AND status = 'pending'", slot.ID)
		
		// Free the slot
		slot.IsBooked = false
		slot.HoldExpiresAt = nil
		if err := tx.Save(&slot).Error; err != nil {
			tx.Rollback()
			continue
		}

		// Check Waitlist for this slot
		var waitlistedUser models.Waitlist
		if err := tx.Where("slot_id = ? AND status = 'waiting'", slot.ID).Order("created_at asc").First(&waitlistedUser).Error; err == nil {
			// Notify this specific user and mark as notified
			waitlistedUser.Status = "notified"
			tx.Save(&waitlistedUser)

			// Fire a special WebSocket event to that user
			websockets.GlobalHub.Broadcast <- map[string]interface{}{
				"type":    "WAITLIST_TURN",
				"slot_id": slot.ID,
				"user_id": waitlistedUser.UserID,
			}
			fmt.Printf("[CRON] 🛎️ Waitlist triggered for Slot #%d to User #%d\n", slot.ID, waitlistedUser.UserID)
		}

		tx.Commit()
		
		fmt.Printf("[CRON] 🗑️ Automatically released expired 10-min hold for Slot #%d\n", slot.ID)

		// Broadcast to everyone that the slot is now open
		websockets.GlobalHub.Broadcast <- map[string]interface{}{
			"type":    "SLOT_UPDATE",
			"slot_id": slot.ID,
			"status":  "available",
		}
	}
}
