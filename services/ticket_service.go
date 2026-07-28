package services

import (
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"turf-booking-system/config"
	"turf-booking-system/models"

	"github.com/skip2/go-qrcode"
)

// GenerateDigitalTicket creates a unique Ticket record with a real phone-scannable base64 QR code
func GenerateDigitalTicket(bookingID uint) (*models.Ticket, error) {
	var existing models.Ticket
	if err := config.DB.Where("booking_id = ?", bookingID).First(&existing).Error; err == nil {
		// Upgrade existing legacy SVG QR code to real phone-scannable PNG QR code
		if strings.HasPrefix(existing.QRCodeData, "data:image/svg") {
			verifyURL := fmt.Sprintf("http://localhost:5173/verify/ticket?code=%s", existing.TicketCode)
			pngBytes, err := qrcode.Encode(verifyURL, qrcode.Medium, 256)
			if err == nil {
				existing.QRCodeData = "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
				config.DB.Save(&existing)
			}
		}
		return &existing, nil
	}

	ticketCode := fmt.Sprintf("TURF-TKT-%d-%d", bookingID, time.Now().Unix()%10000)
	verifyURL := fmt.Sprintf("http://localhost:5173/verify/ticket?code=%s", ticketCode)

	// Generate 100% real phone-scannable QR code PNG image bytes
	pngBytes, err := qrcode.Encode(verifyURL, qrcode.Medium, 256)
	if err != nil {
		return nil, fmt.Errorf("failed to generate QR code: %v", err)
	}

	qrCodeDataURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)

	ticket := models.Ticket{
		BookingID:  bookingID,
		TicketCode: ticketCode,
		QRCodeData: qrCodeDataURI,
		IssuedAt:   time.Now(),
	}

	if err := config.DB.Create(&ticket).Error; err != nil {
		return nil, fmt.Errorf("failed to save ticket: %v", err)
	}

	fmt.Printf("[TICKET ENGINE] 🎟️ Real Phone-Scannable QR Ticket Issued: %s for Booking #%d (Verify URL: %s)\n", ticketCode, bookingID, verifyURL)
	return &ticket, nil
}
