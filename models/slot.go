package models

import "time"

// Slot represents a bookable time window for a specific Turf
type Slot struct {
	ID        uint    `gorm:"primaryKey" json:"id"`
	TurfID    uint    `gorm:"not null;uniqueIndex:idx_turf_time_date" json:"turf_id"`
	Turf      Turf    `gorm:"foreignKey:TurfID" json:"turf,omitempty"`
	StartTime string  `gorm:"type:varchar(10);not null;uniqueIndex:idx_turf_time_date" json:"start_time"` // Format: HH:MM
	EndTime   string  `gorm:"type:varchar(10);not null" json:"end_time"`
	Date      string  `gorm:"type:varchar(10);not null;default:'';uniqueIndex:idx_turf_time_date" json:"date"`
	IsBooked  bool    `gorm:"default:false" json:"is_booked"`
	IsLocked      bool       `gorm:"default:false" json:"is_locked"`
	HoldExpiresAt     *time.Time `json:"hold_expires_at,omitempty"`
	BasePrice         float64    `gorm:"type:decimal(10,2);not null" json:"base_price"`
	MatchmakingStatus string     `gorm:"type:varchar(20);default:'none'" json:"matchmaking_status"` // "none", "open_for_players", "full"
	RequiredPlayers   int        `gorm:"default:10" json:"required_players"`
	CurrentPlayers    int        `gorm:"default:0" json:"current_players"`
}
