package models

import "time"

// PaymentTransaction represents the financial ledger record for a booking or split payment
type PaymentTransaction struct {
	ID                    uint      `gorm:"primaryKey" json:"id"`
	BookingID             uint      `json:"booking_id"`
	UserID                uint      `json:"user_id"`
	User                  User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	StripePaymentIntentID string    `json:"stripe_payment_intent_id"`
	Amount                float64   `json:"amount"`
	Currency              string    `json:"currency"`
	Status                string    `json:"status"` // "succeeded", "failed", "refunded", "disputed"
	PaymentMethod         string    `json:"payment_method"`
	Timeline              string    `json:"timeline"` // e.g. "Created -> Succeeded"
	CreatedAt             time.Time `json:"created_at"`
}
