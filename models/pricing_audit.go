package models

import "time"

// PricingAuditLog logs every dynamic price computation for analytics and auditing
type PricingAuditLog struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	SlotID          uint      `gorm:"not null;index" json:"slot_id"`
	BasePrice       float64   `gorm:"type:decimal(10,2)" json:"base_price"`
	FinalPrice      float64   `gorm:"type:decimal(10,2)" json:"final_price"`
	AppliedRules    string    `gorm:"type:text" json:"applied_rules"`           // JSON array string of rule names & multipliers
	DemandIndicator string    `gorm:"type:varchar(20)" json:"demand_indicator"` // "LOW", "NORMAL", "HIGH", "SURGE"
	CalculatedAt    time.Time `json:"calculated_at"`
}
