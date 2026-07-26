//go:build ignore
// +build ignore

package main

import (
	"fmt"
	"turf-booking-system/config"
	"turf-booking-system/models"
)

func main() {
	config.ConnectDatabase()
	var users []models.User
	config.DB.Find(&users)
	for _, u := range users {
		fmt.Printf("User: ID=%d, Name=%s, Phone=%s\n", u.ID, u.Name, u.Phone)
	}
}
