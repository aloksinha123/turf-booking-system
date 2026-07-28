package models

import "time"

// MatchPlayer tracks individual player participation and payment in a match
type MatchPlayer struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	MatchID            uint      `gorm:"not null;uniqueIndex:idx_match_user" json:"match_id"`
	Match              Match     `gorm:"foreignKey:MatchID" json:"match,omitempty"`
	UserID             uint      `gorm:"not null;uniqueIndex:idx_match_user" json:"user_id"`
	User               User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Status             string    `gorm:"type:varchar(20);default:'joined'" json:"status"` // "joined", "paid", "cancelled", "refunded", "waitlisted"
	IsCreator          bool      `gorm:"default:false" json:"is_creator"`
	StripeClientSecret string    `gorm:"type:varchar(255)" json:"stripe_client_secret"`
	JoinedAt           time.Time `json:"joined_at"`
}
