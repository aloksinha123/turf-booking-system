package models

import "time"

// SystemSetting stores system-wide key-value settings (maintenance mode, alerts, etc.)
type SystemSetting struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}
