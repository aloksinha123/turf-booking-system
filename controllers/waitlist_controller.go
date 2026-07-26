package controllers

import (
	"net/http"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"

	"github.com/gin-gonic/gin"
)

// JoinWaitlist adds a user to the queue for a held slot
func JoinWaitlist(c *gin.Context) {
	slotID := c.Param("id")
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized access"})
		return
	}
	userID := userIDVal.(uint)

	// Verify the slot is actually held/pending (not fully available or fully confirmed)
	var slot models.Slot
	if err := config.DB.First(&slot, slotID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot not found"})
		return
	}

	if !slot.IsBooked {
		// If it's not booked, tell them to just book it
		c.JSON(http.StatusBadRequest, gin.H{"error": "This slot is currently available! You can book it directly."})
		return
	}

	// Check if user is already waitlisted
	var existingWaitlist models.Waitlist
	if err := config.DB.Where("slot_id = ? AND user_id = ? AND status = ?", slotID, userID, "waiting").First(&existingWaitlist).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You are already on the waitlist for this slot."})
		return
	}

	// Add to waitlist
	waitlistEntry := models.Waitlist{
		SlotID:    slot.ID,
		UserID:    userID,
		Status:    "waiting",
		CreatedAt: time.Now(),
	}

	if err := config.DB.Create(&waitlistEntry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join waitlist"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Successfully joined the waitlist! We will notify you if it becomes available.",
	})
}
