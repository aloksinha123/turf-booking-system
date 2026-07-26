package models

import "time"

// Waitlist tracks users who want to book a slot that is currently held by someone else
type Waitlist struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SlotID    uint      `gorm:"not null;index" json:"slot_id"`
	Slot      Slot      `gorm:"foreignKey:SlotID" json:"slot,omitempty"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Status    string    `gorm:"type:varchar(20);default:'waiting'" json:"status"` // "waiting", "notified"
	CreatedAt time.Time `json:"created_at"`
}
