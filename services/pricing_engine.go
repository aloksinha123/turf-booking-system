package services

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
)

// AppliedRuleDetail stores info on each rule that modified the base price
type AppliedRuleDetail struct {
	RuleName   string  `json:"rule_name"`
	RuleType   string  `json:"rule_type"`
	Multiplier float64 `json:"multiplier"`
}

// PriceBreakdown is the full transparent fare breakdown response for customers
type PriceBreakdown struct {
	BasePrice        float64             `json:"base_price"`
	FinalPrice       float64             `json:"final_price"`
	AppliedRules     []AppliedRuleDetail `json:"applied_rules"`
	DemandIndicator  string              `json:"demand_indicator"` // "LOW", "NORMAL", "HIGH", "SURGE"
	OccupancyPercent float64             `json:"occupancy_percent"`
	MinPriceFloor    float64             `json:"min_price_floor"`
	MaxPriceCeiling  float64             `json:"max_price_ceiling"`
}

// Global multiplier safety bounds
const (
	MinPriceFloorRatio = 0.5  // Price cannot drop below 50% of base price
	MaxPriceCeilRatio  = 3.0  // Price cannot exceed 300% of base price
)

// Global admin multiplier variable (backed up for fast access)
var AdminGlobalMultiplier float64 = 1.0

// EvaluateSlotPricing is the centralized Airline/Hotel Yield Engine
func EvaluateSlotPricing(slot models.Slot, bookingDate time.Time) PriceBreakdown {
	basePrice := slot.BasePrice
	if basePrice <= 0 {
		basePrice = 500.0 // Default fallback base price
	}

	minFloor := basePrice * MinPriceFloorRatio
	maxCeiling := basePrice * MaxPriceCeilRatio
	accumulatedMultiplier := 1.0

	var appliedRules []AppliedRuleDetail

	// 1. Fetch DB rules sorted by Priority DESC
	var dbRules []models.PricingRule
	config.DB.Where("is_active = ?", true).Order("priority desc").Find(&dbRules)

	// Sort rules deterministically
	sort.Slice(dbRules, func(i, j int) bool {
		return dbRules[i].Priority > dbRules[j].Priority
	})

	// Track which rule types have already applied (so higher priority rules override lower priority of same type)
	appliedTypes := make(map[string]bool)

	slotTimeStr := slot.StartTime
	slotDateStr := slot.Date

	// Calculate slot start time
	var slotStart time.Time
	if slotDateStr != "" && slotTimeStr != "" {
		t, err := time.Parse("2006-01-02 15:04", slotDateStr+" "+slotTimeStr)
		if err == nil {
			slotStart = t
		}
	}
	if slotStart.IsZero() {
		slotStart = time.Now().Add(24 * time.Hour)
	}

	// 2. Evaluate DB Rules
	now := time.Now()
	hoursUntilSlot := slotStart.Sub(now).Hours()

	for _, rule := range dbRules {
		if appliedTypes[rule.RuleType] {
			continue // Skip if a higher priority rule of this type already applied
		}

		// Check turf filter
		if rule.TurfID != nil && *rule.TurfID != slot.TurfID {
			continue
		}

		// Check date range
		if rule.StartDate != nil && bookingDate.Before(*rule.StartDate) {
			continue
		}
		if rule.EndDate != nil && bookingDate.After(*rule.EndDate) {
			continue
		}

		// Check days of week
		if rule.DaysOfWeek != "" {
			weekdayStr := bookingDate.Weekday().String()[:3] // e.g. "Sat"
			if !strings.Contains(rule.DaysOfWeek, weekdayStr) {
				continue
			}
		}

		// Check time window
		if rule.StartTime != "" && rule.EndTime != "" {
			if slotTimeStr < rule.StartTime || slotTimeStr > rule.EndTime {
				continue
			}
		}

		// Check Early Bird
		if rule.RuleType == "early_bird" {
			if rule.MinHoursBefore > 0 && hoursUntilSlot < float64(rule.MinHoursBefore) {
				continue
			}
		}

		// Check Last Minute
		if rule.RuleType == "last_minute" {
			if rule.MaxHoursBefore > 0 && hoursUntilSlot > float64(rule.MaxHoursBefore) {
				continue
			}
		}

		// Rule matches! Apply multiplier
		mult := rule.Multiplier
		if mult <= 0 {
			mult = 1.0
		}

		accumulatedMultiplier *= mult
		appliedTypes[rule.RuleType] = true
		appliedRules = append(appliedRules, AppliedRuleDetail{
			RuleName:   rule.Name,
			RuleType:   rule.RuleType,
			Multiplier: mult,
		})
	}

	// 3. Evaluate Built-in Peak Hour Rule if not overridden
	if !appliedTypes["peak_hour"] && slotTimeStr != "" {
		t, err := time.Parse("15:04", slotTimeStr)
		if err == nil {
			hour := t.Hour()
			if hour >= 17 && hour <= 22 {
				accumulatedMultiplier *= 1.5
				appliedTypes["peak_hour"] = true
				appliedRules = append(appliedRules, AppliedRuleDetail{
					RuleName:   "Prime Time Peak Hour (17:00-22:00)",
					RuleType:   "peak_hour",
					Multiplier: 1.5,
				})
			}
		}
	}

	// 4. Evaluate Built-in Weekend Rule if not overridden
	if !appliedTypes["weekend"] {
		day := bookingDate.Weekday()
		if day == time.Saturday || day == time.Sunday {
			accumulatedMultiplier *= 1.3
			appliedTypes["weekend"] = true
			appliedRules = append(appliedRules, AppliedRuleDetail{
				RuleName:   "Weekend Surge (+30%)",
				RuleType:   "weekend",
				Multiplier: 1.3,
			})
		}
	}

	// 5. Evaluate Live Weather
	if !appliedTypes["weather"] {
		weatherMult, isRaining := GetWeatherMultiplier()
		if isRaining && weatherMult != 1.0 {
			accumulatedMultiplier *= weatherMult
			appliedTypes["weather"] = true
			appliedRules = append(appliedRules, AppliedRuleDetail{
				RuleName:   "Monsoon Flash Discount (-30%)",
				RuleType:   "weather",
				Multiplier: weatherMult,
			})
		}
	}

	// 6. Evaluate Admin Global Multiplier Override
	if AdminGlobalMultiplier > 0 && AdminGlobalMultiplier != 1.0 {
		accumulatedMultiplier *= AdminGlobalMultiplier
		appliedRules = append(appliedRules, AppliedRuleDetail{
			RuleName:   "Admin Multiplier Override",
			RuleType:   "admin_override",
			Multiplier: AdminGlobalMultiplier,
		})
	}

	// 7. Calculate AI Historical Occupancy & Demand Indicator
	prob, demandTag := CalculatePredictiveDynamicPrice(slot.TurfID, slotTimeStr, bookingDate)
	if prob > 1.0 {
		prob = 1.0
	}
	occupancyPercent := math.Round(prob * 100)

	if demandTag == "SURGE" && !appliedTypes["surge"] {
		accumulatedMultiplier *= 1.4
		appliedRules = append(appliedRules, AppliedRuleDetail{
			RuleName:   "AI High Demand Surge (+40%)",
			RuleType:   "surge",
			Multiplier: 1.4,
		})
	} else if demandTag == "FLASH_SALE" && !appliedTypes["last_minute"] {
		accumulatedMultiplier *= 0.7
		appliedRules = append(appliedRules, AppliedRuleDetail{
			RuleName:   "Off-Peak Flash Sale (-30%)",
			RuleType:   "last_minute",
			Multiplier: 0.7,
		})
	}

	// Compute Raw Final Price
	calculatedPrice := basePrice * accumulatedMultiplier

	// Clamp within Min Floor & Max Ceiling Safety Safeguards
	finalPrice := math.Max(minFloor, math.Min(maxCeiling, calculatedPrice))

	// Round to nearest integer
	finalPrice = math.Round(finalPrice)

	// Save Audit Log asynchronously
	rulesJSON, _ := json.Marshal(appliedRules)
	go func() {
		config.DB.Create(&models.PricingAuditLog{
			SlotID:          slot.ID,
			BasePrice:       basePrice,
			FinalPrice:      finalPrice,
			AppliedRules:    string(rulesJSON),
			DemandIndicator: demandTag,
			CalculatedAt:    time.Now(),
		})
	}()

	return PriceBreakdown{
		BasePrice:        basePrice,
		FinalPrice:       finalPrice,
		AppliedRules:     appliedRules,
		DemandIndicator:  demandTag,
		OccupancyPercent: occupancyPercent,
		MinPriceFloor:    minFloor,
		MaxPriceCeiling:  maxCeiling,
	}
}
