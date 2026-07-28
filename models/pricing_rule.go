package models

import "time"

// PricingRule represents a scheduled or priority-based pricing policy (Holiday, Early Bird, Last Minute, Peak Hour, Surge)
type PricingRule struct {
	ID                 uint       `gorm:"primaryKey" json:"id"`
	Name               string     `gorm:"type:varchar(100);not null" json:"name"`
	RuleType           string     `gorm:"type:varchar(30);not null" json:"rule_type"` // "holiday", "early_bird", "last_minute", "peak_hour", "surge", "weather", "admin_override"
	Priority           int        `gorm:"default:10" json:"priority"`                 // Higher number = higher priority
	Multiplier         float64    `gorm:"type:decimal(5,2);default:1.0" json:"multiplier"`
	FixedDiscount      float64    `gorm:"type:decimal(10,2);default:0.0" json:"fixed_discount"`
	TurfID             *uint      `json:"turf_id,omitempty"`                    // Optional: null = all turfs
	Sport              string     `gorm:"type:varchar(30)" json:"sport"`        // Optional: null = all sports
	StartDate          *time.Time `json:"start_date,omitempty"`
	EndDate            *time.Time `json:"end_date,omitempty"`
	StartTime          string     `gorm:"type:varchar(10)" json:"start_time"`   // e.g. "17:00"
	EndTime            string     `gorm:"type:varchar(10)" json:"end_time"`     // e.g. "22:00"
	DaysOfWeek         string     `gorm:"type:varchar(50)" json:"days_of_week"` // e.g. "Sat,Sun"
	MinHoursBefore     int        `json:"min_hours_before"`                     // For early bird (e.g. 48 hrs before)
	MaxHoursBefore     int        `json:"max_hours_before"`                     // For last minute (e.g. 2 hrs before)
	IsActive           bool       `gorm:"default:true" json:"is_active"`
	CreatedAt          time.Time  `json:"created_at"`
}
