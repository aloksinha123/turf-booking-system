package models

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Booking records a confirmed slot reservation under a transaction lock
type Booking struct {
	ID                 uint           `gorm:"primaryKey" json:"id"`
	UserID             uint           `gorm:"not null;index" json:"user_id"`
	User               User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
	SlotID             uint           `gorm:"not null;index" json:"slot_id"`
	Slot               Slot           `gorm:"foreignKey:SlotID" json:"slot,omitempty"`
	ReferenceID        string         `gorm:"type:varchar(20);uniqueIndex;not null" json:"reference_id"`
	FinalAmount        float64        `gorm:"type:decimal(10,2);not null" json:"final_amount"`
	Status             string         `gorm:"type:varchar(20);default:'pending'" json:"status"` // "pending", "completed", "cancelled"
	IsSplit            bool           `gorm:"default:false" json:"is_split"`
	PrimaryPaid        bool           `gorm:"default:false" json:"primary_paid"`
	SplitStatus        string         `gorm:"type:varchar(20);default:'none'" json:"split_status"` // "none", "pending", "fully_paid"
	Splits             []BookingSplit `gorm:"foreignKey:BookingID" json:"splits,omitempty"`
	IsMatchmaking      bool           `gorm:"default:false" json:"is_matchmaking"`
	IsMatchmakingJoin  bool           `gorm:"default:false" json:"is_matchmaking_join"`
	IdempotencyKey     string         `gorm:"type:varchar(100);uniqueIndex" json:"idempotency_key"`
	StripeClientSecret string         `gorm:"type:varchar(255)" json:"stripe_client_secret"`
	ReminderSent       bool           `gorm:"default:false" json:"reminder_sent"`
	BookedAt           time.Time      `json:"booked_at"`
}

// BeforeCreate is a GORM hook that runs before a new Booking is saved to the database.
func (b *Booking) BeforeCreate(tx *gorm.DB) (err error) {
	if b.ReferenceID == "" {
		// Generate an 8-character secure random hex string
		bytes := make([]byte, 4)
		if _, err := rand.Read(bytes); err == nil {
			b.ReferenceID = fmt.Sprintf("BKG-%s", strings.ToUpper(hex.EncodeToString(bytes)))
		} else {
			// Fallback string if rand fails
			b.ReferenceID = fmt.Sprintf("BKG-%d", time.Now().UnixNano())
		}
	}
	return
}
