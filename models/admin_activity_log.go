package models

import "time"

// AdminActivityLog records every admin action for audit and security compliance
type AdminActivityLog struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	AdminID        uint      `gorm:"not null;index" json:"admin_id"`
	AdminName      string    `gorm:"type:varchar(100)" json:"admin_name"`
	AdminRole      string    `gorm:"type:varchar(30)" json:"admin_role"`
	Action         string    `gorm:"type:varchar(100);not null" json:"action"`         // e.g. "BULK_PRICE_UPDATE", "TOGGLE_MAINTENANCE"
	TargetResource string    `gorm:"type:varchar(100)" json:"target_resource"`         // e.g. "Slots #10-#25"
	Details        string    `gorm:"type:text" json:"details"`
	IPAddress      string    `gorm:"type:varchar(45)" json:"ip_address"`
	CreatedAt      time.Time `json:"created_at"`
}
