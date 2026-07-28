package models

import "time"

// Match represents a public/private matchmaking session where players can join
type Match struct {
	ID              uint          `gorm:"primaryKey" json:"id"`
	CreatorID       uint          `gorm:"not null;index" json:"creator_id"`
	Creator         User          `gorm:"foreignKey:CreatorID" json:"creator,omitempty"`
	SlotID          uint          `gorm:"not null;index" json:"slot_id"`
	Slot            Slot          `gorm:"foreignKey:SlotID" json:"slot,omitempty"`
	Title           string        `gorm:"type:varchar(100);not null" json:"title"`
	Sport           string        `gorm:"type:varchar(30);not null" json:"sport"`                    // "football", "cricket", "badminton"
	SkillLevel      string        `gorm:"type:varchar(20);default:'any'" json:"skill_level"`         // "beginner", "intermediate", "advanced", "any"
	Visibility      string        `gorm:"type:varchar(20);default:'public'" json:"visibility"`       // "public", "private"
	RequiredPlayers int           `gorm:"not null" json:"required_players"`
	CurrentPlayers  int           `gorm:"default:0" json:"current_players"`
	PricePerPlayer  float64       `gorm:"type:decimal(10,2);not null" json:"price_per_player"`
	Status          string        `gorm:"type:varchar(20);default:'open'" json:"status"`             // "open", "full", "confirmed", "cancelled", "expired"
	RegistrationEnd time.Time     `json:"registration_end"`
	CreatedAt       time.Time     `json:"created_at"`
	Players         []MatchPlayer `gorm:"foreignKey:MatchID" json:"players,omitempty"`
}
