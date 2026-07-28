package controllers

import (
	"fmt"
	"net/http"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
)

// ForceReleaseSlot allows an admin to abruptly cancel a pending hold and free the slot
func ForceReleaseSlot(c *gin.Context) {
	slotID := c.Param("id")

	var slot models.Slot
	if err := config.DB.First(&slot, slotID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot not found"})
		return
	}

	if slot.IsBooked {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot forcefully release a slot that is completely booked and paid for. You must cancel the booking instead."})
		return
	}

	tx := config.DB.Begin()

	// 1. Mark any pending bookings as cancelled
	if err := tx.Exec("UPDATE bookings SET status = 'cancelled' WHERE slot_id = ? AND status = 'pending'", slot.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update associated bookings"})
		return
	}

	// 2. Free the slot
	slot.HoldExpiresAt = nil
	if err := tx.Save(&slot).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to release slot hold"})
		return
	}

	// 3. Trigger Waitlist Logic
	var waitlistedUser models.Waitlist
	if err := tx.Where("slot_id = ? AND status = 'waiting'", slot.ID).Order("created_at asc").First(&waitlistedUser).Error; err == nil {
		waitlistedUser.Status = "notified"
		tx.Save(&waitlistedUser)

		websockets.EmitEvent("WAITLIST_TURN", "", waitlistedUser.UserID, gin.H{
			"slot_id": slot.ID,
			"user_id": waitlistedUser.UserID,
		})
	}

	tx.Commit()

	// Broadcast globally that it is available
	websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
		"slot_id": slot.ID,
		"status":  "available",
	})
	
	// Broadcast to the user who was holding it that their cart was forcefully emptied
	websockets.EmitEvent("CART_EXPIRED", "", 0, gin.H{
		"slot_id": slot.ID,
	})

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Slot #%d forcefully released.", slot.ID),
	})
}

// ExtendSlotHold allows an admin to add +5 minutes to an existing hold
func ExtendSlotHold(c *gin.Context) {
	slotID := c.Param("id")

	var slot models.Slot
	if err := config.DB.First(&slot, slotID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot not found"})
		return
	}

	if slot.HoldExpiresAt == nil || slot.HoldExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Slot does not have an active hold to extend."})
		return
	}

	newExpiry := slot.HoldExpiresAt.Add(5 * time.Minute)
	slot.HoldExpiresAt = &newExpiry
	
	if err := config.DB.Save(&slot).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to extend hold"})
		return
	}

	// Push update so admin UI resets its timer locally (if we have one) or just reloads
	websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
		"slot_id": slot.ID,
		"status":  "extended",
	})

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Hold on Slot #%d extended by 5 minutes.", slot.ID),
	})
}
