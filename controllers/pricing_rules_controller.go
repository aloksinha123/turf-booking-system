package controllers

import (
	"fmt"
	"net/http"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"

	"github.com/gin-gonic/gin"
)

// AdminGetPricingRules lists all scheduled and priority rules
func AdminGetPricingRules(c *gin.Context) {
	var rules []models.PricingRule
	if err := config.DB.Order("priority desc, id desc").Find(&rules).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pricing rules"})
		return
	}
	c.JSON(http.StatusOK, rules)
}

// AdminCreatePricingRule handles rule creation with input validation (0x or negative multipliers rejected)
func AdminCreatePricingRule(c *gin.Context) {
	var rule models.PricingRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pricing rule payload"})
		return
	}

	// Input Validation: Reject zero or negative multipliers
	if rule.Multiplier <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid multiplier value. Multiplier must be greater than 0x (e.g., 1.25x)"})
		return
	}

	if rule.Multiplier < 0.2 || rule.Multiplier > 5.0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Multiplier must be between 0.2x and 5.0x for system stability"})
		return
	}

	if rule.Priority <= 0 {
		rule.Priority = 10
	}
	rule.CreatedAt = time.Now()

	if err := config.DB.Create(&rule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create pricing rule"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": fmt.Sprintf("Pricing rule '%s' (%.2fx, Priority #%d) created successfully!", rule.Name, rule.Multiplier, rule.Priority),
		"rule":    rule,
	})
}

// AdminTogglePricingRule enables/disables a rule
func AdminTogglePricingRule(c *gin.Context) {
	ruleID := c.Param("id")

	var rule models.PricingRule
	if err := config.DB.First(&rule, ruleID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Pricing rule not found"})
		return
	}

	rule.IsActive = !rule.IsActive
	config.DB.Save(&rule)

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Pricing rule '%s' is now %s", rule.Name, map[bool]string{true: "ACTIVE", false: "INACTIVE"}[rule.IsActive]),
		"is_active": rule.IsActive,
	})
}



// AdminGetPricingAnalytics returns dynamic pricing yield & revenue metrics
func AdminGetPricingAnalytics(c *gin.Context) {
	var auditLogs []models.PricingAuditLog
	config.DB.Order("id desc").Limit(100).Find(&auditLogs)

	var totalBase float64
	var totalDynamic float64
	surgeCount := 0
	flashCount := 0

	for _, log := range auditLogs {
		totalBase += log.BasePrice
		totalDynamic += log.FinalPrice
		if log.DemandIndicator == "SURGE" {
			surgeCount++
		} else if log.DemandIndicator == "FLASH_SALE" {
			flashCount++
		}
	}

	revenueUplift := totalDynamic - totalBase

	c.JSON(http.StatusOK, gin.H{
		"total_base_value":       totalBase,
		"total_dynamic_revenue": totalDynamic,
		"revenue_uplift":         revenueUplift,
		"surge_count":            surgeCount,
		"flash_sale_count":       flashCount,
		"audit_logs":             auditLogs,
	})
}
