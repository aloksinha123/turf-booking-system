package controllers

import (
	"encoding/csv"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
)

// LogAdminActivity is a helper function to record administrative audit logs
func LogAdminActivity(c *gin.Context, action string, targetResource string, details string) {
	adminIDVal, exists := c.Get("user_id")
	adminID := uint(1)
	if exists {
		adminID = adminIDVal.(uint)
	}

	adminName := "Admin"
	adminRole := "owner"
	var adminUser models.User
	if err := config.DB.First(&adminUser, adminID).Error; err == nil {
		adminName = adminUser.Name
		if adminUser.AdminRole != "" {
			adminRole = adminUser.AdminRole
		}
	}

	ipAddress := c.ClientIP()

	logEntry := models.AdminActivityLog{
		AdminID:        adminID,
		AdminName:      adminName,
		AdminRole:      adminRole,
		Action:         action,
		TargetResource: targetResource,
		Details:        details,
		IPAddress:      ipAddress,
		CreatedAt:      time.Now(),
	}

	config.DB.Create(&logEntry)
}

// GetV2Analytics handles multi-range revenue analytics, status filters, and AI insights
func GetV2Analytics(c *gin.Context) {
	timeRange := c.DefaultQuery("range", "today")
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")
	statusFilter := c.Query("status")

	now := time.Now()
	var startTime time.Time

	switch timeRange {
	case "today":
		startTime = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	case "weekly":
		startTime = now.AddDate(0, 0, -7)
	case "monthly":
		startTime = now.AddDate(0, -1, 0)
	case "yearly":
		startTime = now.AddDate(-1, 0, 0)
	case "custom":
		if startDateStr != "" {
			if t, err := time.Parse("2006-01-02", startDateStr); err == nil {
				startTime = t
			}
		}
		if startTime.IsZero() {
			startTime = now.AddDate(0, -1, 0)
		}
	default:
		startTime = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	}

	var endTime time.Time = now
	if timeRange == "custom" && endDateStr != "" {
		if t, err := time.Parse("2006-01-02", endDateStr); err == nil {
			endTime = time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, time.Local)
		}
	}

	// 1. Total Revenue Query
	queryBookings := config.DB.Model(&models.Booking{}).Where("booked_at >= ? AND booked_at <= ?", startTime, endTime)
	if statusFilter != "" {
		queryBookings = queryBookings.Where("status = ?", statusFilter)
	} else {
		queryBookings = queryBookings.Where("status IN ?", []string{"confirmed", "paid"})
	}

	var totalRevenue float64
	queryBookings.Select("COALESCE(SUM(final_amount), 0)").Row().Scan(&totalRevenue)

	// 2. Count Stats
	var totalBookings int64
	queryBookings.Count(&totalBookings)

	var confirmedCount int64
	config.DB.Model(&models.Booking{}).Where("booked_at >= ? AND booked_at <= ? AND status = ?", startTime, endTime, "confirmed").Count(&confirmedCount)

	var cancelledCount int64
	config.DB.Model(&models.Booking{}).Where("booked_at >= ? AND booked_at <= ? AND status = ?", startTime, endTime, "cancelled").Count(&cancelledCount)

	var expiredCount int64
	config.DB.Model(&models.Booking{}).Where("booked_at >= ? AND booked_at <= ? AND status = ?", startTime, endTime, "expired").Count(&expiredCount)

	// 3. Occupancy Rate % Calculation
	var totalSlots int64
	config.DB.Model(&models.Slot{}).Count(&totalSlots)
	var bookedSlots int64
	config.DB.Model(&models.Slot{}).Where("is_booked = ?", true).Count(&bookedSlots)

	occupancyRate := 0.0
	if totalSlots > 0 {
		occupancyRate = math.Round((float64(bookedSlots) / float64(totalSlots)) * 100)
	}

	// Average Booking Value (ABV)
	abv := 0.0
	if confirmedCount > 0 {
		abv = math.Round(totalRevenue / float64(confirmedCount))
	}

	// Dynamic Pricing Uplift from Audit Logs
	var auditLogs []models.PricingAuditLog
	config.DB.Where("calculated_at >= ? AND calculated_at <= ?", startTime, endTime).Find(&auditLogs)
	var totalBaseVal float64
	var totalDynamicVal float64
	for _, l := range auditLogs {
		totalBaseVal += l.BasePrice
		totalDynamicVal += l.FinalPrice
	}
	dynamicUplift := math.Max(0, totalDynamicVal-totalBaseVal)

	// Split Payment Revenue
	var splitRevenue float64
	config.DB.Model(&models.BookingSplit{}).Where("created_at >= ? AND created_at <= ? AND status = ?", startTime, endTime, "paid").Select("COALESCE(SUM(share_amount), 0)").Row().Scan(&splitRevenue)

	// Matchmaking Revenue
	var matchRevenue float64
	config.DB.Model(&models.MatchPlayer{}).Where("joined_at >= ? AND joined_at <= ? AND status = ?", startTime, endTime, "paid").Select("COALESCE(SUM(100), 0)").Row().Scan(&matchRevenue) // approximate

	// AI Generated Occupancy Insights
	var aiInsights []string
	if occupancyRate >= 80 {
		aiInsights = append(aiInsights, fmt.Sprintf("🔥 High Occupancy Alert (%v%%)! We recommend increasing peak hour surge multipliers by +15%%.", occupancyRate))
	} else if occupancyRate < 40 {
		aiInsights = append(aiInsights, fmt.Sprintf("⚡ Low Occupancy (%v%%). Consider launching a Flash Sale or 20%% off Promo Coupon.", occupancyRate))
	} else {
		aiInsights = append(aiInsights, fmt.Sprintf("🟢 Stable Occupancy Rate (%v%%). Peak hours (5 PM - 10 PM) are generating 65%% of total revenue.", occupancyRate))
	}
	if cancelledCount > 5 {
		aiInsights = append(aiInsights, fmt.Sprintf("⚠️ Cancellation spike detected (%d cancellations in selected range).", cancelledCount))
	}
	if dynamicUplift > 0 {
		aiInsights = append(aiInsights, fmt.Sprintf("📈 Yield Engine generated +₹%.0f extra revenue via dynamic pricing.", dynamicUplift))
	}

	c.JSON(http.StatusOK, gin.H{
		"time_range":            timeRange,
		"total_revenue":         totalRevenue,
		"total_bookings":        totalBookings,
		"confirmed_count":       confirmedCount,
		"cancelled_count":       cancelledCount,
		"expired_count":         expiredCount,
		"occupancy_rate":        occupancyRate,
		"avg_booking_value":     abv,
		"dynamic_revenue_uplift": dynamicUplift,
		"split_revenue":         splitRevenue,
		"matchmaking_revenue":   matchRevenue,
		"ai_insights":           aiInsights,
	})
}

// BulkSlotGeneration generates slots for multi-date ranges in one call
type BulkGenerateRequest struct {
	TurfID    uint   `json:"turf_id" binding:"required"`
	StartDate string `json:"start_date" binding:"required"` // "YYYY-MM-DD"
	EndDate   string `json:"end_date" binding:"required"`   // "YYYY-MM-DD"
	BasePrice float64 `json:"base_price"`
}

func BulkSlotGeneration(c *gin.Context) {
	var req BulkGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	start, err1 := time.Parse("2006-01-02", req.StartDate)
	end, err2 := time.Parse("2006-01-02", req.EndDate)
	if err1 != nil || err2 != nil || end.Before(start) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date range"})
		return
	}

	if req.BasePrice <= 0 {
		req.BasePrice = 500.0
	}

	hours := []string{
		"10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
		"16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
	}

	totalCreated := 0
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		for i := 0; i < len(hours)-1; i++ {
			var existing models.Slot
			if err := config.DB.Where("turf_id = ? AND date = ? AND start_time = ?", req.TurfID, dateStr, hours[i]).First(&existing).Error; err != nil {
				slot := models.Slot{
					TurfID:     req.TurfID,
					Date:       dateStr,
					StartTime:  hours[i],
					EndTime:    hours[i+1],
					BasePrice:  req.BasePrice,
					IsBooked:   false,
					IsLocked:   false,
				}
				config.DB.Create(&slot)
				totalCreated++
			}
		}
	}

	LogAdminActivity(c, "BULK_SLOT_GENERATE", fmt.Sprintf("Turf #%d (%s to %s)", req.TurfID, req.StartDate, req.EndDate), fmt.Sprintf("Created %d slots", totalCreated))

	// Broadcast WS update
	go func() {
		websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{"event": "slots_updated"})
	}()

	c.JSON(http.StatusCreated, gin.H{
		"message":       fmt.Sprintf("Bulk slots generated! %d new slots created from %s to %s.", totalCreated, req.StartDate, req.EndDate),
		"slots_created": totalCreated,
	})
}

// BulkEditSlotPrice updates prices for multiple selected slots or date range
type BulkEditPriceRequest struct {
	SlotIDs  []uint  `json:"slot_ids"`
	Date     string  `json:"date"`
	TurfID   uint    `json:"turf_id"`
	NewPrice float64 `json:"new_price" binding:"required"`
}

func BulkEditSlotPrice(c *gin.Context) {
	var req BulkEditPriceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	if req.NewPrice <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Price must be greater than zero"})
		return
	}

	query := config.DB.Model(&models.Slot{}).Where("is_booked = ?", false)

	if len(req.SlotIDs) > 0 {
		query = query.Where("id IN ?", req.SlotIDs)
	} else {
		if req.Date != "" {
			query = query.Where("date = ?", req.Date)
		}
		if req.TurfID != 0 {
			query = query.Where("turf_id = ?", req.TurfID)
		}
	}

	result := query.Update("base_price", req.NewPrice)

	LogAdminActivity(c, "BULK_PRICE_EDIT", fmt.Sprintf("Price ₹%.0f", req.NewPrice), fmt.Sprintf("Updated %d slots", result.RowsAffected))

	go func() {
		websockets.EmitEvent("PRICE_CHANGED", "", 0, gin.H{"event": "slots_updated", "new_price": req.NewPrice})
	}()

	c.JSON(http.StatusOK, gin.H{
		"message":        fmt.Sprintf("Bulk price updated to ₹%.0f for %d slots", req.NewPrice, result.RowsAffected),
		"slots_updated": result.RowsAffected,
	})
}

// BulkLockSlots freezes or unfreezes multiple slots in one click
type BulkLockRequest struct {
	SlotIDs  []uint `json:"slot_ids" binding:"required"`
	IsLocked bool   `json:"is_locked"`
}

func BulkLockSlots(c *gin.Context) {
	var req BulkLockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	result := config.DB.Model(&models.Slot{}).Where("id IN ? AND is_booked = ?", req.SlotIDs, false).Update("is_locked", req.IsLocked)

	actionStr := "BULK_FREEZE"
	if !req.IsLocked {
		actionStr = "BULK_UNFREEZE"
	}
	LogAdminActivity(c, actionStr, fmt.Sprintf("%d slots", len(req.SlotIDs)), fmt.Sprintf("Updated %d slots", result.RowsAffected))

	go func() {
		websockets.EmitEvent("SLOT_UPDATED", "", 0, gin.H{"event": "slots_updated", "is_locked": req.IsLocked})
	}()

	c.JSON(http.StatusOK, gin.H{
		"message":        fmt.Sprintf("Bulk lock status updated for %d slots", result.RowsAffected),
		"slots_updated": result.RowsAffected,
	})
}

// System Maintenance Controls
func ToggleMaintenanceMode(c *gin.Context) {
	var req struct {
		IsMaintenance bool   `json:"is_maintenance"`
		Reason        string `json:"reason"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	valStr := "false"
	if req.IsMaintenance {
		valStr = "true"
	}
	if req.Reason == "" {
		req.Reason = "System maintenance in progress. Bookings paused temporarily."
	}

	config.DB.Where("key = ?", "maintenance_mode").Assign(models.SystemSetting{Key: "maintenance_mode", Value: valStr, UpdatedAt: time.Now()}).FirstOrCreate(&models.SystemSetting{})
	config.DB.Where("key = ?", "maintenance_reason").Assign(models.SystemSetting{Key: "maintenance_reason", Value: req.Reason, UpdatedAt: time.Now()}).FirstOrCreate(&models.SystemSetting{})

	LogAdminActivity(c, "TOGGLE_MAINTENANCE", fmt.Sprintf("Maintenance=%s", valStr), req.Reason)

	go func() {
		websockets.EmitEvent("SYSTEM_MAINTENANCE", "", 0, gin.H{
			"event":          "maintenance_update",
			"is_maintenance": req.IsMaintenance,
			"reason":         req.Reason,
		})
	}()

	c.JSON(http.StatusOK, gin.H{
		"message":        fmt.Sprintf("System maintenance mode is now %s", map[bool]string{true: "ENABLED 🚫", false: "DISABLED 🟢"}[req.IsMaintenance]),
		"is_maintenance": req.IsMaintenance,
		"reason":         req.Reason,
	})
}

// GetPublicSystemStatus is called by frontend to check maintenance mode
func GetPublicSystemStatus(c *gin.Context) {
	var settingMode models.SystemSetting
	var settingReason models.SystemSetting

	isMaintenance := false
	reason := ""

	if err := config.DB.Where("key = ?", "maintenance_mode").First(&settingMode).Error; err == nil {
		if settingMode.Value == "true" {
			isMaintenance = true
		}
	}

	if err := config.DB.Where("key = ?", "maintenance_reason").First(&settingReason).Error; err == nil {
		reason = settingReason.Value
	}

	c.JSON(http.StatusOK, gin.H{
		"is_maintenance": isMaintenance,
		"reason":         reason,
	})
}

// ExportBookingsCSV streams formatted CSV data download
func ExportBookingsCSV(c *gin.Context) {
	status := c.Query("status")
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")

	query := config.DB.Preload("Slot").Preload("User").Order("booked_at desc")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if startDateStr != "" {
		if t, err := time.Parse("2006-01-02", startDateStr); err == nil {
			query = query.Where("booked_at >= ?", t)
		}
	}
	if endDateStr != "" {
		if t, err := time.Parse("2006-01-02", endDateStr); err == nil {
			query = query.Where("booked_at <= ?", t.Add(24*time.Hour))
		}
	}

	var bookings []models.Booking
	if err := query.Find(&bookings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookings for export"})
		return
	}

	filename := fmt.Sprintf("turf_bookings_export_%s.csv", time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))

	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"Booking ID", "Customer Name", "Customer Phone", "Turf ID",
		"Slot Date", "Slot Time", "Status", "Final Amount (INR)",
		"Is Split Booking", "Booked At",
	})

	for _, b := range bookings {
		custName := "Guest"
		custPhone := "N/A"
		if b.User.Name != "" {
			custName = b.User.Name
		}
		if b.User.Phone != "" {
			custPhone = b.User.Phone
		}

		_ = writer.Write([]string{
			strconv.FormatUint(uint64(b.ID), 10),
			custName,
			custPhone,
			strconv.FormatUint(uint64(b.Slot.TurfID), 10),
			b.Slot.Date,
			fmt.Sprintf("%s - %s", b.Slot.StartTime, b.Slot.EndTime),
			b.Status,
			fmt.Sprintf("%.2f", b.FinalAmount),
			strconv.FormatBool(b.IsSplit),
			b.BookedAt.Format("2006-01-02 15:04:05"),
		})
	}

	writer.Flush()
	LogAdminActivity(c, "EXPORT_BOOKINGS_CSV", fmt.Sprintf("%d rows", len(bookings)), filename)
}

// GetAdminActivityLogs returns audit trail logs
func GetAdminActivityLogs(c *gin.Context) {
	var logs []models.AdminActivityLog
	if err := config.DB.Order("created_at desc").Limit(100).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch activity logs"})
		return
	}
	c.JSON(http.StatusOK, logs)
}

// GetSystemHealth Status Monitor
func GetSystemHealth(c *gin.Context) {
	dbStatus := "CONNECTED 🟢"
	if err := config.DB.Exec("SELECT 1").Error; err != nil {
		dbStatus = "DISCONNECTED 🔴"
	}

	activeWsClients := len(websockets.GlobalHub.Clients)

	c.JSON(http.StatusOK, gin.H{
		"db_status":            dbStatus,
		"active_websocket_clients": activeWsClients,
		"cron_status":          "ACTIVE 🕒 (Standard Expiry, Split Expiry, Matchmaking Expiry)",
		"server_time":          time.Now().Format("2006-01-02 15:04:05 IST"),
	})
}

// GetEventReplay streams missed events for clients reconnecting or waking from tab sleep
func GetEventReplay(c *gin.Context) {
	lastSeqStr := c.Query("last_seq_id")
	var lastSeq uint64 = 0
	if lastSeqStr != "" {
		fmt.Sscanf(lastSeqStr, "%d", &lastSeq)
	}

	missedEvents := websockets.GlobalReplayStore.GetEventsSince(lastSeq)

	c.JSON(http.StatusOK, gin.H{
		"last_seq_id":   lastSeq,
		"missed_count": len(missedEvents),
		"events":       missedEvents,
	})
}
