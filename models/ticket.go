package models

import "time"

// Ticket represents an automated digital pass with a unique QR code for venue check-in
type Ticket struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	BookingID  uint      `gorm:"uniqueIndex" json:"booking_id"`
	Booking    Booking   `gorm:"foreignKey:BookingID" json:"booking,omitempty"`
	TicketCode string    `gorm:"uniqueIndex" json:"ticket_code"`
	QRCodeData string    `gorm:"type:text" json:"qr_code_data"` // Base64 SVG data URI
	IssuedAt   time.Time `json:"issued_at"`
}
