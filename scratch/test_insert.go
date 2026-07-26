package main

import (
	"fmt"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"gorm.io/gorm/clause"
)

func main() {
	config.ConnectDatabase()
	
	targetDate := "2026-07-21"
	var slots []models.Slot
	for hour := 10; hour < 22; hour++ {
		startTime := fmt.Sprintf("%02d:00", hour)
		endTime := fmt.Sprintf("%02d:00", hour+1)
		
		slots = append(slots, models.Slot{
			TurfID:    1,
			StartTime: startTime,
			EndTime:   endTime,
			Date:      targetDate,
			BasePrice: 1000.0,
			IsBooked:  false,
			IsLocked:  false,
		})
	}

	err := config.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&slots).Error
	if err != nil {
		fmt.Printf("Error: %v\n", err)
	} else {
		fmt.Println("Success!")
	}

	var count int64
	config.DB.Model(&models.Slot{}).Where("date = ?", targetDate).Count(&count)
	fmt.Printf("Total slots for date %s: %d\n", targetDate, count)
}
