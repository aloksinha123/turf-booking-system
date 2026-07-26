package services

import (
	"time"
	"turf-booking-system/config"
)

// CalculatePredictiveDynamicPrice computes pricing based on historical occupancy probability.
func CalculatePredictiveDynamicPrice(turfID uint, slotTime string, bookingDate time.Time) (float64, string) {
	// Calculate Historical Occupancy Rate (Past 30 Days for specific Turf, Time, and Day of Week)
	var bookingCount int64

	// Get day of week (0=Sunday, 1=Monday ... 6=Saturday)
	// PostgreSQL EXTRACT(DOW FROM booked_at) matches this logic.
	dayOfWeek := int(bookingDate.Weekday())

	// Run an advanced SQL Analytics query using GORM to count past bookings
	// for the same slot time and day of week within the last 30 days.
	config.DB.Raw(`
		SELECT COUNT(*) 
		FROM bookings b
		JOIN slots s ON b.slot_id = s.id
		WHERE s.turf_id = ? 
		  AND s.start_time = ? 
		  AND b.booked_at >= NOW() - INTERVAL '30 days'
		  AND EXTRACT(DOW FROM b.booked_at) = ?
	`, turfID, slotTime, dayOfWeek).Scan(&bookingCount)

	// Since we look back 30 days, there are roughly 4 occurrences of any specific day of the week.
	// Probability = bookingCount / 4.0
	// Cap probability at 1.0 (in case there were 5 occurrences)
	probability := float64(bookingCount) / 4.0
	if probability > 1.0 {
		probability = 1.0
	}

	// Rule 1: High Demand Surge
	if probability >= 0.90 {
		return 1.4, "SURGE"
	}

	// Parse hour for Rule 2
	t, err := time.Parse("15:04", slotTime)
	hour := -1
	if err == nil {
		hour = t.Hour()
	}

	// Rule 2: Low Demand Flash Sale
	// Weekday afternoon (Tue-Thu = 2, 3, 4) between 12:00 and 16:00
	isWeekdayAfternoon := (dayOfWeek >= 2 && dayOfWeek <= 4) && (hour >= 12 && hour <= 16)
	
	if probability <= 0.20 && isWeekdayAfternoon {
		return 0.7, "FLASH_SALE"
	}

	// Default normal pricing
	return 1.0, "NORMAL"
}
