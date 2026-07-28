package models

import "time"

// Coupon tracks discount codes and compatibility with dynamic surge pricing
type Coupon struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Code               string    `gorm:"type:varchar(30);uniqueIndex;not null" json:"code"`
	DiscountType       string    `gorm:"type:varchar(20);default:'percentage'" json:"discount_type"` // "percentage", "flat"
	DiscountValue      float64   `gorm:"type:decimal(10,2);not null" json:"discount_value"`
	MaxDiscount        float64   `gorm:"type:decimal(10,2)" json:"max_discount"`
	MinBookingAmount   float64   `gorm:"type:decimal(10,2);default:0" json:"min_booking_amount"`
	AllowWithSurge     bool      `gorm:"default:false" json:"allow_with_surge"`
	UsageLimit         int       `gorm:"default:100" json:"usage_limit"`
	TimesUsed          int       `gorm:"default:0" json:"times_used"`
	ExpiresAt          time.Time `json:"expires_at"`
	IsActive           bool      `gorm:"default:true" json:"is_active"`
}
