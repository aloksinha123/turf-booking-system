package controllers

import (
	"net/http"
	"time"

	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/services"

	"github.com/gin-gonic/gin"
)

// GetDigitalTicket returns the issued ticket and QR code for a booking
func GetDigitalTicket(c *gin.Context) {
	bookingID := c.Param("booking_id")

	var booking models.Booking
	if err := config.DB.Preload("Slot.Turf").Preload("User").First(&booking, bookingID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
		return
	}

	ticket, err := services.GenerateDigitalTicket(booking.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate digital ticket"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ticket":  ticket,
		"booking": booking,
	})
}

// VerifyTicketByCode verifies QR code validity for venue check-in staff
func VerifyTicketByCode(c *gin.Context) {
	code := c.Param("code")

	var ticket models.Ticket
	if err := config.DB.Preload("Booking.Slot.Turf").Preload("Booking.User").Where("ticket_code = ?", code).First(&ticket).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"valid":   false,
			"message": "Invalid or forged ticket QR code!",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":   true,
		"message": "Ticket verified successfully 🟢",
		"ticket":  ticket,
	})
}

// GetFinanceSummary returns revenue, refunds, webhook idempotency audit logs, and payment transactions
func GetFinanceSummary(c *gin.Context) {
	var grossRevenue float64
	var totalRefunds float64
	var confirmedCount int64
	var failedCount int64

	config.DB.Model(&models.Booking{}).Where("status = ?", "confirmed").Select("COALESCE(SUM(final_amount), 0)").Row().Scan(&grossRevenue)
	config.DB.Model(&models.Booking{}).Where("status = ?", "confirmed").Count(&confirmedCount)
	config.DB.Model(&models.Booking{}).Where("status = ?", "failed").Count(&failedCount)

	var transactions []models.PaymentTransaction
	config.DB.Preload("User").Order("id desc").Limit(50).Find(&transactions)

	var webhookLogs []models.WebhookEvent
	config.DB.Order("id desc").Limit(50).Find(&webhookLogs)

	c.JSON(http.StatusOK, gin.H{
		"metrics": gin.H{
			"gross_revenue":   grossRevenue,
			"total_refunds":   totalRefunds,
			"net_earnings":    grossRevenue - totalRefunds,
			"confirmed_count": confirmedCount,
			"failed_count":    failedCount,
			"currency":        "INR (₹)",
			"updated_at":      time.Now().Format("2006-01-02 15:04:05 IST"),
		},
		"transactions":   transactions,
		"webhook_events": webhookLogs,
	})
}
