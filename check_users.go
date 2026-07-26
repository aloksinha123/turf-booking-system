//go:build ignore
// +build ignore

// Standalone debug utility — run directly with: go run check_users.go
// NOT included in normal `go build ./...` to avoid main() conflict.

package main

import (
	"fmt"
	"turf-booking-system/config"
	"turf-booking-system/models"
)

func main() {
	config.ConnectDatabase()
	
	var slots []models.Slot
	config.DB.Find(&slots)
	fmt.Printf("--- SLOTS (Total: %d) ---\n", len(slots))
	for _, s := range slots {
		fmt.Printf("Slot: ID=%d, TurfID=%d, Time=%s-%s, Date=%s, IsBooked=%t, IsLocked=%t, CurrentPlayers=%d\n", 
			s.ID, s.TurfID, s.StartTime, s.EndTime, s.Date, s.IsBooked, s.IsLocked, s.CurrentPlayers)
	}

	var bookings []models.Booking
	config.DB.Find(&bookings)
	fmt.Printf("\n--- BOOKINGS (Total: %d) ---\n", len(bookings))
	for _, b := range bookings {
		fmt.Printf("Booking: ID=%d, SlotID=%d, FinalAmount=%.2f, Status=%s, IsSplit=%t, PrimaryPaid=%t, SplitStatus=%s\n", 
			b.ID, b.SlotID, b.FinalAmount, b.Status, b.IsSplit, b.PrimaryPaid, b.SplitStatus)
	}

	var splits []models.BookingSplit
	config.DB.Find(&splits)
	fmt.Printf("\n--- SPLITS (Total: %d) ---\n", len(splits))
	for _, sp := range splits {
		fmt.Printf("Split: ID=%d, BookingID=%d, Share=%.2f, Status=%s\n", 
			sp.ID, sp.BookingID, sp.ShareAmount, sp.Status)
	}
}
