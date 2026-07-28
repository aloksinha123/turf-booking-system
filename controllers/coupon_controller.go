package controllers

import (
	"math"
	"net/http"
	"strings"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/services"

	"github.com/gin-gonic/gin"
)

type ApplyCouponRequest struct {
	Code        string  `json:"code" binding:"required"`
	SlotID      uint    `json:"slot_id" binding:"required"`
	OriginalAmt float64 `json:"original_amount"`
}

// ApplyCoupon calculates discount and compatibility with dynamic pricing
func ApplyCoupon(c *gin.Context) {
	var req ApplyCouponRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid coupon request payload"})
		return
	}

	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))

	var coupon models.Coupon
	if err := config.DB.Where("code = ? AND is_active = ?", req.Code, true).First(&coupon).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invalid or expired coupon code"})
		return
	}

	// Check Expiry
	if !coupon.ExpiresAt.IsZero() && time.Now().After(coupon.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This coupon code has expired"})
		return
	}

	// Check Usage Limit
	if coupon.UsageLimit > 0 && coupon.TimesUsed >= coupon.UsageLimit {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Coupon usage limit reached"})
		return
	}

	// Evaluate Slot Pricing to check Surge status
	var slot models.Slot
	if err := config.DB.First(&slot, req.SlotID).Error; err == nil {
		breakdown := services.EvaluateSlotPricing(slot, time.Now())
		if breakdown.DemandIndicator == "SURGE" && !coupon.AllowWithSurge {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "This promotional coupon cannot be combined with High Demand Surge Pricing.",
			})
			return
		}
	}

	bookingAmt := req.OriginalAmt
	if bookingAmt <= 0 && slot.BasePrice > 0 {
		bookingAmt = slot.BasePrice
	}

	// Check Minimum Booking Amount
	if coupon.MinBookingAmount > 0 && bookingAmt < coupon.MinBookingAmount {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Minimum booking amount of ₹" + string(rune(coupon.MinBookingAmount)) + " required for this coupon",
		})
		return
	}

	// Calculate Discount
	var discount float64
	if coupon.DiscountType == "percentage" {
		discount = bookingAmt * (coupon.DiscountValue / 100.0)
		if coupon.MaxDiscount > 0 && discount > coupon.MaxDiscount {
			discount = coupon.MaxDiscount
		}
	} else {
		discount = coupon.DiscountValue
	}

	discount = math.Min(bookingAmt, math.Round(discount))
	finalPayable := math.Max(0, bookingAmt-discount)

	c.JSON(http.StatusOK, gin.H{
		"message":           "Coupon applied successfully! 🎉",
		"coupon_code":       coupon.Code,
		"discount_amount":   discount,
		"original_amount":   bookingAmt,
		"final_amount":      finalPayable,
		"allow_with_surge":  coupon.AllowWithSurge,
	})
}

// AdminGetCoupons returns all coupons
func AdminGetCoupons(c *gin.Context) {
	var coupons []models.Coupon
	if err := config.DB.Order("id desc").Find(&coupons).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch coupons"})
		return
	}
	c.JSON(http.StatusOK, coupons)
}

// AdminCreateCoupon creates a new coupon code
func AdminCreateCoupon(c *gin.Context) {
	var coupon models.Coupon
	if err := c.ShouldBindJSON(&coupon); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid coupon payload"})
		return
	}

	coupon.Code = strings.ToUpper(strings.TrimSpace(coupon.Code))
	if coupon.ExpiresAt.IsZero() {
		coupon.ExpiresAt = time.Now().Add(30 * 24 * time.Hour) // 30 days default
	}

	if err := config.DB.Create(&coupon).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Coupon code already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Coupon code created successfully!",
		"coupon":  coupon,
	})
}
