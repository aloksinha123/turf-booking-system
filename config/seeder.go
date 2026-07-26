package config

import (
	"fmt"
	"log"
	"turf-booking-system/models"
)

func SeedDatabase() {
	// --- Seed Admin User ---
	var userCount int64
	DB.Model(&models.User{}).Count(&userCount)
	if userCount == 0 {
		// bcrypt hash of "admin123"
		admin := models.User{
			Name:         "Alok Sinha",
			Email:        "alok.sinha@example.com",
			PasswordHash: "$2a$10$OtDIWg9G21YRn0G9dqnj9Ofre01QDdNu3uWA14pH/1.0C8/X4nChe", 
			Role:         "admin",
		}
		if err := DB.Create(&admin).Error; err != nil {
			log.Println("Seeder user error:", err)
		}
		fmt.Println("Seeded admin user: Alok Sinha")
	}

	// --- Seed Sample Turf ---
	var turfCount int64
	DB.Model(&models.Turf{}).Count(&turfCount)
	if turfCount == 0 {
		turf := models.Turf{
			Name:        "Bovox Arena A",
			Location:    "Mumbai",
			Description: "Premium 5-a-side FIFA-certified synthetic turf with floodlights.",
			BasePrice:   1000.00,
		}
		if err := DB.Create(&turf).Error; err != nil {
			log.Println("Seeder turf error:", err)
			return
		}
		fmt.Println("Seeded turf:", turf.Name)
		return
	}

	fmt.Println("Database already seeded — skipping.")
}
