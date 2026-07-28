package models

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"type:varchar(100);not null" json:"name"`
	Email        string    `gorm:"type:varchar(100);uniqueIndex" json:"email"` // Optional for customers
	Phone        string    `gorm:"type:varchar(15);uniqueIndex" json:"phone"`  // For customer OTP login
	PasswordHash string    `gorm:"type:varchar(255)" json:"-"`                 // Optional for customers
	Role         string    `gorm:"type:varchar(20);default:'customer'" json:"role"` // "admin" or "customer"
	AdminRole    string    `gorm:"type:varchar(20);default:'owner'" json:"admin_role"` // "owner", "manager", "staff"
	CreatedAt    time.Time `json:"created_at"`
}
