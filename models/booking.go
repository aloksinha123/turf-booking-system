package models

import "time"

// Booking records a confirmed slot reservation under a transaction lock
type Booking struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"not null;index" json:"user_id"`
	User        User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	SlotID      uint      `gorm:"not null;index" json:"slot_id"`
	Slot        Slot      `gorm:"foreignKey:SlotID" json:"slot,omitempty"`
	FinalAmount float64   `gorm:"type:decimal(10,2);not null" json:"final_amount"`
	Status      string    `gorm:"type:varchar(20);default:'pending'" json:"status"` // "pending", "completed", "cancelled"
	IsSplit      bool      `gorm:"default:false" json:"is_split"`
	PrimaryPaid  bool      `gorm:"default:false" json:"primary_paid"`
	SplitStatus  string    `gorm:"type:varchar(20);default:'none'" json:"split_status"` // "none", "pending", "fully_paid"
	IsMatchmaking     bool `gorm:"default:false" json:"is_matchmaking"`
	IsMatchmakingJoin bool `gorm:"default:false" json:"is_matchmaking_join"`
	ReminderSent bool      `gorm:"default:false" json:"reminder_sent"`
	BookedAt     time.Time `json:"booked_at"`
}
