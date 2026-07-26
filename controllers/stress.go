package controllers

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

// StressTestRequest represents the payload for triggering a test
type StressTestRequest struct {
	SlotID uint `json:"slot_id"`
}

// TelemetryPayload represents the metrics broadcasted to WebSocket clients
type TelemetryPayload struct {
	Event            string  `json:"event"`
	SlotID           uint    `json:"slot_id"`
	TotalRequests    int32   `json:"total_requests"`
	Successful       int32   `json:"successful"`
	Failed           int32   `json:"failed"`
	AvgLatencyMs     float64 `json:"avg_latency_ms"`
	TotalDurationMs  int64   `json:"total_duration_ms"`
	ActiveDBConns    int     `json:"active_db_conns"` // Mocked or fetched from sql.DBStats
}

// RunStressTest simulates 50 concurrent booking requests on the same slot
func RunStressTest(c *gin.Context) {
	var req StressTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.SlotID = 1 // Default to slot 1 if no payload provided
	}

	// First, let's reset the slot to ensure a clean test
	config.DB.Model(&models.Slot{}).Where("id = ?", req.SlotID).Updates(map[string]interface{}{
		"is_booked": false,
		"hold_expires_at": nil,
	})

	const numWorkers = 50
	var wg sync.WaitGroup
	var successCount int32
	var failCount int32

	startTime := time.Now()
	
	// Start 50 goroutines
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			
			// Open a database transaction for this goroutine
			tx := config.DB.Begin()
			
			// Simulate a tiny network delay jitter (0-5ms) to ensure concurrent hits
			// time.Sleep(time.Duration(rand.Intn(5)) * time.Millisecond)

			var slot models.Slot
			
			// PostgreSQL Row-Level Lock: SELECT ... FOR UPDATE
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&slot, req.SlotID).Error; err != nil {
				tx.Rollback()
				atomic.AddInt32(&failCount, 1)
				return
			}

			if slot.IsBooked {
				// Already booked by another goroutine!
				tx.Rollback()
				atomic.AddInt32(&failCount, 1)
				return
			}

			// Not booked, let's grab it!
			slot.IsBooked = true
			if err := tx.Save(&slot).Error; err != nil {
				tx.Rollback()
				atomic.AddInt32(&failCount, 1)
				return
			}

			tx.Commit()
			atomic.AddInt32(&successCount, 1)
		}(i)
	}

	wg.Wait()
	duration := time.Since(startTime)

	// Gather metrics
	payload := TelemetryPayload{
		Event:           "STRESS_TEST_RESULT",
		SlotID:          req.SlotID,
		TotalRequests:   numWorkers,
		Successful:      successCount,
		Failed:          failCount,
		AvgLatencyMs:    float64(duration.Milliseconds()) / float64(numWorkers),
		TotalDurationMs: duration.Milliseconds(),
	}

	// Fetch actual database stats (Active connections)
	sqlDB, err := config.DB.DB()
	if err == nil {
		payload.ActiveDBConns = sqlDB.Stats().InUse
	}

	// Broadcast metrics to WebSocket clients
	websockets.GlobalHub.Broadcast <- payload

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Stress test complete. %d workers hit slot %d", numWorkers, req.SlotID),
		"telemetry": payload,
	})
}
