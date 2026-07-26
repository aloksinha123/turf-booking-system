package controllers

import (
	"fmt"
	"net/http"
	"os"
	"turf-booking-system/config"
	"turf-booking-system/models"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/paymentintent"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// VerifySplitToken checks the token, returns info, and generates a Stripe client secret for payment
func VerifySplitToken(c *gin.Context) {
	token := c.Param("token")

	var clientSecret string
	var shareAmount float64
	var turfName string
	var startTime string
	var endTime string
	var bookingID uint

	var date string

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var split models.BookingSplit
		// GORM v2 clause.Locking: atomically locks the specific split token row to prevent race conditions
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Booking.Slot.Turf").Where("token = ?", token).First(&split).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Invalid or expired token"})
			return err
		}

		if split.Status == "paid" {
			c.JSON(http.StatusConflict, gin.H{"error": "This split portion has already been paid!"})
			return fmt.Errorf("token already used")
		}

		if split.StripeClientSecret != "" {
			clientSecret = split.StripeClientSecret
		} else {
			// Generate Payment Intent for this specific friend
			stripeKey := os.Getenv("STRIPE_SECRET_KEY")
			if stripeKey == "" {
				stripeKey = os.Getenv("STRIPE_SECRET_KEY")
			}
			stripe.Key = stripeKey
			params := &stripe.PaymentIntentParams{
				Amount:   stripe.Int64(int64(split.ShareAmount * 100)),
				Currency: stripe.String(string(stripe.CurrencyINR)),
				AutomaticPaymentMethods: &stripe.PaymentIntentAutomaticPaymentMethodsParams{
					Enabled: stripe.Bool(true),
				},
			}
			params.AddMetadata("split_token", token)
			params.AddMetadata("booking_id", fmt.Sprintf("%d", split.BookingID))

			pi, err := paymentintent.New(params)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initialize payment gateway"})
				return err
			}
			
			clientSecret = pi.ClientSecret
			split.StripeClientSecret = clientSecret
			if err := tx.Save(&split).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while holding token"})
				return err
			}
		}

		shareAmount = split.ShareAmount
		turfName = split.Booking.Slot.Turf.Name
		startTime = split.Booking.Slot.StartTime
		endTime = split.Booking.Slot.EndTime
		bookingID = split.BookingID
		date = split.Booking.Slot.Date

		return nil
	})

	if err != nil {
		return // response already sent inside transaction
	}

	c.JSON(http.StatusOK, gin.H{
		"share_amount":  shareAmount,
		"turf_name":     turfName,
		"start_time":    startTime,
		"end_time":      endTime,
		"date":          date,
		"client_secret": clientSecret,
		"booking_id":    bookingID,
		"token":         token,
	})
}
