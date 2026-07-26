package cron

import (
	"fmt"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/services"
)

// StartReminderCron initializes a background ticker that checks for upcoming matches
func StartReminderCron() {
	// Run every 1 minute
	ticker := time.NewTicker(1 * time.Minute)
	
	go func() {
		fmt.Println("[CRON] 🕒 Match Reminder Engine Started...")
		for {
			<-ticker.C
			processReminders()
		}
	}()
}

func processReminders() {
	var bookings []models.Booking

	// Query for confirmed bookings where reminder has NOT been sent
	// Since we are mocking, we just check all confirmed ones
	err := config.DB.Preload("Slot").Preload("User").
		Where("status = ? AND reminder_sent = ?", "confirmed", false).
		Find(&bookings).Error

	if err != nil {
		fmt.Println("[CRON ERROR] Failed to fetch bookings:", err)
		return
	}

	now := time.Now()

	for _, b := range bookings {
		// Parse the Slot's StartTime (format "HH:MM")
		slotTime, err := time.Parse("15:04", b.Slot.StartTime)
		if err != nil {
			continue
		}
		
		// Parse the Slot's Date (format "2006-01-02")
		slotDate, err := time.Parse("2006-01-02", b.Slot.Date)
		if err != nil {
			continue
		}

		// Combine Date and Time
		matchTime := time.Date(slotDate.Year(), slotDate.Month(), slotDate.Day(), slotTime.Hour(), slotTime.Minute(), 0, 0, now.Location())

		// Calculate the difference
		diff := matchTime.Sub(now)

		// If the match is within the next 2 hours (between 1h59m and 2h01m approximately)
		// To make it reliable for the 1-minute ticker, we check if diff is between 0 and 2 hours
		// Actually, standard logic is diff <= 2 hours && diff > 0
		if diff > 0 && diff <= 2*time.Hour {
			// Send Reminder
			services.SendMatchReminder(&b)

			// Mark as sent
			b.ReminderSent = true
			config.DB.Save(&b)
		}
	}
}
