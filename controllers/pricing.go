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
	"gorm.io/gorm/clause"
)

// Global state for pricing multiplier (for demo purposes)
var GlobalPricingMultiplier float64 = 1.0

func CalculateDynamicPrice(basePrice float64, startTimeStr string, weatherMultiplier float64, weekendMultiplier float64) float64 {
	t, err := time.Parse("15:04", startTimeStr)
	if err != nil {
		return basePrice
	}

	hour := t.Hour()
	peakMultiplier := 1.0

	// Shaam 5 PM (17:00) se lekar Raat 10 PM (22:00) tak prime slots hotey hain
	if hour >= 17 && hour <= 22 {
		peakMultiplier = 1.5
	}

	// Final Engine Computation
	finalPrice := basePrice * GlobalPricingMultiplier * peakMultiplier * weekendMultiplier * weatherMultiplier
	return finalPrice
}

// GetAvailableSlots Route endpoint controllers setup
func GetAvailableSlots(c *gin.Context) {
	var slots []models.Slot

	turfID := c.Query("turf_id")
	date := c.Query("date")
	
	query := config.DB.Where("is_booked = ? AND is_locked = ? AND (hold_expires_at IS NULL OR hold_expires_at <= ?)", false, false, time.Now())
	
	if date != "" {
		query = query.Where("date = ?", date)
	}

	todayStr := time.Now().Format("2006-01-02")
	if date == todayStr || date == "" {
		// Filter out slots that have already started in real life for today
		currentTimeStr := time.Now().Format("15:04")
		query = query.Where("start_time > ?", currentTimeStr)
	}

	if turfID != "" {
		query = query.Where("turf_id = ?", turfID)
	}

	// Database lookup to extract non-booked and non-locked intervals status parameters
	if err := query.Find(&slots).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch operational slots matrix"})
		return
	}

	// Fetch live smart modifiers
	_, isRaining := services.GetWeatherMultiplier()
	
	isWeekend := false
	today := time.Now().Weekday()
	if today == time.Saturday || today == time.Sunday {
		isWeekend = true
	}

	type SlotWithOriginal struct {
		models.Slot
		OriginalPrice  float64                 `json:"original_price"`
		PricingTag     string                  `json:"pricing_tag"`
		PriceBreakdown services.PriceBreakdown `json:"price_breakdown"`
	}

	var responseSlots []SlotWithOriginal
	targetDate := time.Now()
	if date != "" {
		if t, err := time.Parse("2006-01-02", date); err == nil {
			targetDate = t
		}
	}

	for i := range slots {
		breakdown := services.EvaluateSlotPricing(slots[i], targetDate)
		originalPrice := breakdown.BasePrice
		slots[i].BasePrice = breakdown.FinalPrice

		responseSlots = append(responseSlots, SlotWithOriginal{
			Slot:           slots[i],
			OriginalPrice:  originalPrice,
			PricingTag:     breakdown.DemandIndicator,
			PriceBreakdown: breakdown,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"slots": responseSlots,
		"modifiers": gin.H{
			"is_weekend":        isWeekend,
			"is_raining":        isRaining,
			"global_multiplier": services.AdminGlobalMultiplier,
		},
	})
}

// Admin Features

func ToggleSlotLock(c *gin.Context) {
	var req struct {
		SlotID uint `json:"slot_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	var slot models.Slot
	if err := config.DB.First(&slot, req.SlotID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot not found"})
		return
	}

	slot.IsLocked = !slot.IsLocked
	config.DB.Save(&slot)

	websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{
		"slot_id":   slot.ID,
		"is_locked": slot.IsLocked,
		"slot":      slot,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Slot lock toggled", "is_locked": slot.IsLocked})
}

func UpdatePricingMultiplier(c *gin.Context) {
	var req struct {
		Multiplier float64 `json:"multiplier" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if req.Multiplier <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Global multiplier cannot be zero or negative!"})
		return
	}
	if req.Multiplier < 0.2 || req.Multiplier > 5.0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Global multiplier must be between 0.2x and 5.0x"})
		return
	}

	GlobalPricingMultiplier = req.Multiplier
	services.AdminGlobalMultiplier = req.Multiplier

	websockets.EmitEvent("PRICE_CHANGED", "", 0, gin.H{
		"multiplier": req.Multiplier,
	})

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Global pricing multiplier updated to %.2fx", req.Multiplier), "multiplier": req.Multiplier})
}

func GetAllSlotsForAdmin(c *gin.Context) {
	date := c.Query("date")
	var slots []models.Slot
	
	query := config.DB.Preload("Turf").Order("id asc")
	if date != "" {
		query = query.Where("date = ?", date)
	}
	
	if err := query.Find(&slots).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database read failed"})
		return
	}
	
	weatherMultiplier, isRaining := services.GetWeatherMultiplier()
	
	isWeekend := false
	weekendMultiplier := 1.0
	today := time.Now().Weekday()
	if today == time.Saturday || today == time.Sunday {
		isWeekend = true
		weekendMultiplier = 1.3
	}

	// Apply current dynamic price to all slots for preview
	for i := range slots {
		slots[i].BasePrice = CalculateDynamicPrice(slots[i].BasePrice, slots[i].StartTime, weatherMultiplier, weekendMultiplier)
	}

	c.JSON(http.StatusOK, gin.H{
		"slots": slots, 
		"current_multiplier": GlobalPricingMultiplier,
		"modifiers": gin.H{
			"is_weekend":        isWeekend,
			"is_raining":        isRaining,
		},
	})
}

// GenerateDailySlots creates empty hourly slots for the day
func GenerateDailySlots(c *gin.Context) {
	var req struct {
		TurfID uint   `json:"turf_id"`
		Date   string `json:"date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}
	
	targetDate := req.Date
	if targetDate == "" {
		targetDate = time.Now().Format("2006-01-02")
	}

	// For Bovox Story: generate slots from 10:00 to 22:00
	var slots []models.Slot
	for hour := 10; hour < 22; hour++ {
		startTime := fmt.Sprintf("%02d:00", hour)
		endTime := fmt.Sprintf("%02d:00", hour+1)
		
		slots = append(slots, models.Slot{
			TurfID:    req.TurfID,
			StartTime: startTime,
			EndTime:   endTime,
			Date:      targetDate,
			BasePrice: 1000.0, // Fixed base price for generation
			IsBooked:  false,
			IsLocked:  false,
		})
	}

	if err := config.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&slots).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate slots"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Daily inventory generated successfully", "count": len(slots)})
}

// SeedDemoAnalytics automatically generates dummy past bookings to populate the dashboard charts
func SeedDemoAnalytics(c *gin.Context) {
	todayStr := time.Now().Format("2006-01-02")
	
	// 1. Generate Slots
	var slots []models.Slot
	for hour := 10; hour < 22; hour++ {
		startTime := fmt.Sprintf("%02d:00", hour)
		endTime := fmt.Sprintf("%02d:00", hour+1)
		
		slots = append(slots, models.Slot{
			TurfID:    1, // Default Turf A
			StartTime: startTime,
			EndTime:   endTime,
			Date:      todayStr,
			BasePrice: 1000.0, 
			IsBooked:  false,
			IsLocked:  false,
		})
	}
	config.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&slots)

	// 2. Fetch today's slots and mark a few as booked
	var todaySlots []models.Slot
	config.DB.Where("date = ? AND turf_id = ?", todayStr, 1).Find(&todaySlots)

	// Mocking peak hour bookings (18:00, 19:00, 20:00) and some random ones (10:00, 14:00)
	targetHours := map[string]int{
		"10:00": 3,
		"14:00": 5,
		"18:00": 12,
		"19:00": 18,
		"20:00": 25,
		"21:00": 15,
	}

	totalSeeded := 0
	for _, slot := range todaySlots {
		if vol, ok := targetHours[slot.StartTime]; ok {
			// Mark this slot as booked just to show in the UI matrix
			slot.IsBooked = true
			config.DB.Save(&slot)

			// Generate N dummy bookings for this hour to simulate "volume"
			// In our schema, we only have 1 booking per slot usually, but for the area chart "volume",
			// we can just insert historical confirmed bookings for today.
			for i := 0; i < vol; i++ {
				dummyBooking := models.Booking{
					UserID:      1,
					SlotID:      slot.ID,
					FinalAmount: 1400.0, // With surge
					Status:      "confirmed",
					BookedAt:    time.Now().Add(-1 * time.Hour), // booked earlier
				}
				config.DB.Create(&dummyBooking)
				totalSeeded++
			}
		}
	}

	// Apply surge
	GlobalPricingMultiplier = 1.4

	c.JSON(http.StatusOK, gin.H{
		"message": "Demo data seeded successfully", 
		"bookings_seeded": totalSeeded,
	})
}

// UpdateSlotPrice manually overrides the base price of a specific slot
func UpdateSlotPrice(c *gin.Context) {
	slotID := c.Param("id")
	var req struct {
		Price float64 `json:"price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	var slot models.Slot
	if err := config.DB.First(&slot, slotID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Slot not found"})
		return
	}

	// Update base price
	slot.BasePrice = req.Price
	config.DB.Save(&slot)

	c.JSON(http.StatusOK, gin.H{"message": "Slot price updated successfully", "slot": slot})
}

// GetAdminAnalytics fetches the SaaS revenue loop metrics
func GetAdminAnalytics(c *gin.Context) {
	var totalRevenue float64
	var activeBookings int64
	var peakBookings int64
	var totalPeakSlots int64

	// 1. Total Revenue & Active Bookings
	var fullBookingRev float64
	var primarySplitRev float64
	var friendSplitRev float64

	// Revenue from full normal bookings
	config.DB.Model(&models.Booking{}).
		Where("status = ? AND is_split = ?", "confirmed", false).
		Select("COALESCE(SUM(final_amount), 0)").Row().Scan(&fullBookingRev)

	// Revenue from primary user in splits
	// Assuming FriendsCount is stored or can be derived. Wait, we don't store FriendsCount directly on Booking.
	// But share amount is FinalAmount / (FriendsCount + 1).
	// We can get this by joining or calculating. Since this is SQLite/Postgres compatible query:
	// A simpler way is to fetch primary paid splits and calculate in Go, or if we just store share_amount.
	var primaryPaidBookings []models.Booking
	config.DB.Where("primary_paid = ? AND is_split = ? AND status NOT IN ?", true, true, []string{"expired", "failed"}).Find(&primaryPaidBookings)
	for _, b := range primaryPaidBookings {
		// Find one split to get the share amount
		var split models.BookingSplit
		if err := config.DB.Where("booking_id = ?", b.ID).First(&split).Error; err == nil {
			primarySplitRev += split.ShareAmount
		}
	}

	// Revenue from friends
	config.DB.Model(&models.BookingSplit{}).
		Where("status = ?", "paid").
		Select("COALESCE(SUM(share_amount), 0)").Row().Scan(&friendSplitRev)

	totalRevenue = fullBookingRev + primarySplitRev + friendSplitRev
	config.DB.Model(&models.Booking{}).Where("status = ?", "confirmed").Count(&activeBookings)

	// 2. Peak Attendance logic
	// Peak slots are 17:00 to 22:00.
	// We need to count total peak slots vs booked peak slots.
	// Since SQLite/Postgres time queries differ, we do it in memory for this demo.
	var slots []models.Slot
	config.DB.Find(&slots)

	for _, s := range slots {
		t, err := time.Parse("15:04", s.StartTime)
		if err == nil {
			if t.Hour() >= 17 && t.Hour() <= 22 {
				totalPeakSlots++
				if s.IsBooked {
					peakBookings++
				}
			}
		}
	}

	peakAttendanceRate := 0.0
	if totalPeakSlots > 0 {
		peakAttendanceRate = (float64(peakBookings) / float64(totalPeakSlots)) * 100.0
	}

	// 3. Hourly Volume for the Area Chart
	// The frontend chart expects data for hours: 06, 08, 10, 12, 14, 16, 18, 20, 22
	// We'll calculate the number of bookings in these intervals.
	chartHours := []int{6, 8, 10, 12, 14, 16, 18, 20, 22}
	hourlyVolume := make([]int, len(chartHours))
	
	// Fetch ALL historic booked slots to build a real-time volume graph based on start_time
	var historicSlots []models.Slot
	config.DB.Where("is_booked = ?", true).Find(&historicSlots)

	for _, s := range historicSlots {
		t, err := time.Parse("15:04", s.StartTime)
		if err == nil {
			hour := t.Hour()
			// Find the closest bucket
			for i, bucket := range chartHours {
				// if hour is between bucket and next bucket (or 24 for last)
				nextBucket := 24
				if i < len(chartHours)-1 {
					nextBucket = chartHours[i+1]
				}
				if hour >= bucket && hour < nextBucket {
					hourlyVolume[i]++
					break
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"total_revenue":        totalRevenue,
		"active_bookings":      activeBookings,
		"peak_attendance_rate": peakAttendanceRate,
		"hourly_volume":        hourlyVolume,
	})
}

// GetTurfSlotsWithPredictivePricing fetches slots for a specific turf and applies AI-driven predictive pricing
func GetTurfSlotsWithPredictivePricing(c *gin.Context) {
	turfID := c.Param("id")
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	query := config.DB.Where("turf_id = ? AND date = ? AND is_booked = ? AND is_locked = ?", turfID, date, false, false)
	
	todayStr := time.Now().Format("2006-01-02")
	if date == todayStr {
		currentTimeStr := time.Now().Format("15:04")
		query = query.Where("start_time > ?", currentTimeStr)
	}

	var slots []models.Slot
	if err := query.Find(&slots).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database read failed"})
		return
	}

	// We'll use today's date as the booking date
	today := time.Now()

	// Prepare payload struct
	type PredictiveSlot struct {
		models.Slot
		PricingTag       string  `json:"pricing_tag"`
		AppliedMultiplier float64 `json:"applied_multiplier"`
	}

	var responseSlots []PredictiveSlot

	for _, s := range slots {
		multiplier, tag := services.CalculatePredictiveDynamicPrice(s.TurfID, s.StartTime, today)
		
		s.BasePrice = s.BasePrice * multiplier

		responseSlots = append(responseSlots, PredictiveSlot{
			Slot:              s,
			PricingTag:        tag,
			AppliedMultiplier: multiplier,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"turf_id": turfID,
		"slots":   responseSlots,
	})
}

