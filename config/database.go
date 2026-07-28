package config

import (
	"fmt"
	"log"
	"turf-booking-system/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDatabase() {
	// Database connection profile
	dsn := "host=localhost user=postgres password=aloksinha818 dbname=godrej_turf_db port=5432 sslmode=disable TimeZone=Asia/Kolkata"

	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database: ", err)
	}

	fmt.Println("Database connection successfully established!")

	// Dev only: Drop tables to reset schema and avoid migration conflicts with existing data
	// database.Migrator().DropTable(&models.BookingSplit{}, &models.Booking{}, &models.Slot{}, &models.Turf{}, &models.User{})

	// GORM Dynamic Migration Setup — order matters (FK dependencies first)
	err = database.AutoMigrate(
		&models.User{},    // No FKs — migrate first
		&models.Turf{},    // No FKs — migrate second
		&models.Slot{},    // Depends on Turf
		&models.Booking{}, // Depends on User + Slot
		&models.BookingSplit{}, // Depends on Booking
		&models.Waitlist{}, // Depends on User + Slot
		&models.Match{},       // Depends on User + Slot
		&models.MatchPlayer{}, // Depends on Match + User
	)
	if err != nil {
		log.Println("Migration Failed: ", err)
	} else {
		fmt.Println("Database Migration completed successfully!")
	}

	DB = database
}
