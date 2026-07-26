package models

// BookingSplit tracks the individual payment tokens generated when a user selects "Split with Friends"
type BookingSplit struct {
	ID          uint    `gorm:"primaryKey" json:"id"`
	BookingID   uint    `gorm:"not null;index" json:"booking_id"`
	Booking     Booking `gorm:"foreignKey:BookingID" json:"booking,omitempty"`
	Token       string  `gorm:"type:varchar(100);uniqueIndex;not null" json:"token"`
	ShareAmount float64 `gorm:"type:decimal(10,2);not null" json:"share_amount"`
	Status      string  `gorm:"type:varchar(20);default:'pending'" json:"status"` // "pending", "paid"
	StripeClientSecret string `gorm:"type:varchar(255)" json:"stripe_client_secret"`
	PaidByUserID *uint   `json:"paid_by_user_id,omitempty"` // User who fulfilled this split portion
}
