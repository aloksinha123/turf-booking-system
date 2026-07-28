package models

import "time"

// WebhookEvent tracks incoming webhook IDs for idempotency verification to prevent duplicate processing
type WebhookEvent struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	EventID     string    `gorm:"uniqueIndex;not null" json:"event_id"`
	EventType   string    `json:"event_type"`
	Status      string    `json:"status"` // "processed", "duplicate", "failed"
	Payload     string    `gorm:"type:text" json:"payload"`
	ProcessedAt time.Time `json:"processed_at"`
}
