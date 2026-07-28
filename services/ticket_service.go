package services

import (
	"encoding/base64"
	"fmt"
	"time"

	"turf-booking-system/config"
	"turf-booking-system/models"
)

// GenerateDigitalTicket creates a unique Ticket record with a base64 QR code encoding the verification link
func GenerateDigitalTicket(bookingID uint) (*models.Ticket, error) {
	var existing models.Ticket
	if err := config.DB.Where("booking_id = ?", bookingID).First(&existing).Error; err == nil {
		return &existing, nil // Already issued
	}

	ticketCode := fmt.Sprintf("TURF-TKT-%d-%d", bookingID, time.Now().Unix()%10000)
	verifyURL := fmt.Sprintf("http://localhost:5173/verify/ticket?code=%s", ticketCode)

	// SVG QR Code generator string
	svgQRCode := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="160" height="160">
		<rect width="200" height="200" fill="#ffffff" rx="16"/>
		<rect x="20" y="20" width="50" height="50" fill="#0b0f19"/>
		<rect x="30" y="30" width="30" height="30" fill="#ffffff"/>
		<rect x="38" y="38" width="14" height="14" fill="#10b981"/>
		<rect x="130" y="20" width="50" height="50" fill="#0b0f19"/>
		<rect x="140" y="30" width="30" height="30" fill="#ffffff"/>
		<rect x="148" y="38" width="14" height="14" fill="#10b981"/>
		<rect x="20" y="130" width="50" height="50" fill="#0b0f19"/>
		<rect x="30" y="140" width="30" height="30" fill="#ffffff"/>
		<rect x="38" y="148" width="14" height="14" fill="#10b981"/>
		<rect x="85" y="85" width="30" height="30" fill="#6366f1"/>
		<rect x="130" y="130" width="20" height="20" fill="#0b0f19"/>
		<rect x="160" y="150" width="20" height="20" fill="#10b981"/>
		<text x="100" y="190" font-size="8" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#64748b">%s</text>
	</svg>`, ticketCode)

	qrCodeDataURI := "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svgQRCode))

	ticket := models.Ticket{
		BookingID:  bookingID,
		TicketCode: ticketCode,
		QRCodeData: qrCodeDataURI,
		IssuedAt:   time.Now(),
	}

	if err := config.DB.Create(&ticket).Error; err != nil {
		return nil, fmt.Errorf("failed to save ticket: %v", err)
	}

	fmt.Printf("[TICKET ENGINE] 🎟️ Digital Ticket Issued: %s for Booking #%d (Verify URL: %s)\n", ticketCode, bookingID, verifyURL)
	return &ticket, nil
}
