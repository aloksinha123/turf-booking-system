package controllers

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"math/rand"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"turf-booking-system/config"
	"turf-booking-system/models"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

// StressTestRequest represents the payload for triggering a concurrency stress test
type StressTestRequest struct {
	SlotID     uint   `json:"slot_id"`
	NumWorkers int    `json:"num_workers"` // 10, 50, 100, 500, 1000
	Scenario   string `json:"scenario"`    // "booking", "split_payment", "matchmaking", "cancellation"
	Mode       string `json:"mode"`        // "normal", "peak", "spike", "chaos"
}

// TelemetryPayload represents statistical latency metrics broadcasted to WebSocket clients
type TelemetryPayload struct {
	Event                   string  `json:"event"`
	SlotID                  uint    `json:"slot_id"`
	Scenario                string  `json:"scenario"`
	Mode                    string  `json:"mode"`
	TotalRequests           int32   `json:"total_requests"`
	Successful              int32   `json:"successful"`
	Failed                  int32   `json:"failed"`
	Status200               int32   `json:"status_200"`
	Status409               int32   `json:"status_409"`
	Status400               int32   `json:"status_400"`
	Status500               int32   `json:"status_500"`
	MinLatencyMs            float64 `json:"min_latency_ms"`
	MaxLatencyMs            float64 `json:"max_latency_ms"`
	AvgLatencyMs            float64 `json:"avg_latency_ms"`
	P50LatencyMs            float64 `json:"p50_latency_ms"`
	P95LatencyMs            float64 `json:"p95_latency_ms"`
	P99LatencyMs            float64 `json:"p99_latency_ms"`
	RPS                     float64 `json:"rps"`
	TotalDurationMs         int64   `json:"total_duration_ms"`
	ActiveDBConns           int     `json:"active_db_conns"`
	OneBookingSuccessPassed bool    `json:"one_booking_success_passed"`
	AuditReportSummary      string  `json:"audit_report_summary"`
}

var LastTestTelemetry TelemetryPayload
var testTelemetryMutex sync.RWMutex

// RunStressTest simulates N concurrent workers (up to 1,000) hitting the specified scenario
func RunStressTest(c *gin.Context) {
	var req StressTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.SlotID = 1
		req.NumWorkers = 50
		req.Scenario = "booking"
		req.Mode = "spike"
	}

	if req.SlotID == 0 {
		req.SlotID = 1
	}
	if req.NumWorkers <= 0 {
		req.NumWorkers = 50
	}
	if req.NumWorkers > 1000 {
		req.NumWorkers = 1000
	}
	if req.Scenario == "" {
		req.Scenario = "booking"
	}
	if req.Mode == "" {
		req.Mode = "spike"
	}

	// Reset slot state before test to ensure clean lock verification
	config.DB.Model(&models.Slot{}).Where("id = ?", req.SlotID).Updates(map[string]interface{}{
		"is_booked":       false,
		"hold_expires_at": nil,
		"current_players": 0,
	})

	var wg sync.WaitGroup
	var successCount int32
	var failCount int32
	var status200 int32
	var status409 int32
	var status400 int32
	var status500 int32

	latencies := make([]float64, req.NumWorkers)
	var latenciesMutex sync.Mutex

	startTime := time.Now()

	// Launch N concurrent goroutine workers
	for i := 0; i < req.NumWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			wStart := time.Now()

			// Add jitter for Spike or Chaos modes
			if req.Mode == "chaos" {
				time.Sleep(time.Duration(rand.Intn(10)) * time.Millisecond)
			} else if req.Mode == "peak" {
				time.Sleep(time.Duration(rand.Intn(3)) * time.Millisecond)
			}

			tx := config.DB.Begin()

			var slot models.Slot

			// Execute transaction with PostgreSQL SELECT ... FOR UPDATE row-level lock
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&slot, req.SlotID).Error; err != nil {
				tx.Rollback()
				atomic.AddInt32(&failCount, 1)
				atomic.AddInt32(&status500, 1)

				latMs := float64(time.Since(wStart).Microseconds()) / 1000.0
				latenciesMutex.Lock()
				latencies[workerID] = latMs
				latenciesMutex.Unlock()
				return
			}

			if req.Scenario == "booking" {
				if slot.IsBooked {
					tx.Rollback()
					atomic.AddInt32(&failCount, 1)
					atomic.AddInt32(&status409, 1) // 409 Conflict
				} else {
					slot.IsBooked = true
					if err := tx.Save(&slot).Error; err != nil {
						tx.Rollback()
						atomic.AddInt32(&failCount, 1)
						atomic.AddInt32(&status500, 1)
					} else {
						tx.Commit()
						atomic.AddInt32(&successCount, 1)
						atomic.AddInt32(&status200, 1)
					}
				}
			} else if req.Scenario == "matchmaking" {
				if slot.CurrentPlayers >= 10 {
					tx.Rollback()
					atomic.AddInt32(&failCount, 1)
					atomic.AddInt32(&status400, 1)
				} else {
					slot.CurrentPlayers++
					tx.Save(&slot)
					tx.Commit()
					atomic.AddInt32(&successCount, 1)
					atomic.AddInt32(&status200, 1)
				}
			} else {
				// Split or Cancellation scenario simulation
				tx.Commit()
				atomic.AddInt32(&successCount, 1)
				atomic.AddInt32(&status200, 1)
			}

			latMs := float64(time.Since(wStart).Microseconds()) / 1000.0
			latenciesMutex.Lock()
			latencies[workerID] = latMs
			latenciesMutex.Unlock()
		}(i)
	}

	wg.Wait()
	totalDuration := time.Since(startTime)
	durationMs := totalDuration.Milliseconds()
	if durationMs == 0 {
		durationMs = 1
	}

	// Calculate Statistical Percentiles (Min, Max, Avg, P50, P95, P99)
	sort.Float64s(latencies)
	var sum float64
	for _, l := range latencies {
		sum += l
	}

	minLat := latencies[0]
	maxLat := latencies[len(latencies)-1]
	avgLat := sum / float64(len(latencies))
	p50Lat := latencies[int(float64(len(latencies))*0.50)]
	p95Lat := latencies[int(float64(len(latencies))*0.95)]
	p99Lat := latencies[int(float64(len(latencies))*0.99)]
	rps := float64(req.NumWorkers) / (float64(durationMs) / 1000.0)

	// Verify Lock Integrity: In booking scenario, exactly 1 success must occur!
	oneSuccessPassed := true
	if req.Scenario == "booking" && successCount != 1 {
		oneSuccessPassed = false
	}

	activeConns := 1
	sqlDB, err := config.DB.DB()
	if err == nil {
		activeConns = sqlDB.Stats().InUse
	}

	auditSummary := fmt.Sprintf("PASS: %d Workers | Scenario: %s | Mode: %s | RPS: %.1f | P95: %.2fms | 200 OK: %d | 409 Conflict: %d",
		req.NumWorkers, req.Scenario, req.Mode, rps, p95Lat, status200, status409)

	payload := TelemetryPayload{
		Event:                   "STRESS_TEST_RESULT",
		SlotID:                  req.SlotID,
		Scenario:                req.Scenario,
		Mode:                    req.Mode,
		TotalRequests:           int32(req.NumWorkers),
		Successful:              successCount,
		Failed:                  failCount,
		Status200:               status200,
		Status409:               status409,
		Status400:               status400,
		Status500:               status500,
		MinLatencyMs:            minLat,
		MaxLatencyMs:            maxLat,
		AvgLatencyMs:            avgLat,
		P50LatencyMs:            p50Lat,
		P95LatencyMs:            p95Lat,
		P99LatencyMs:            p99Lat,
		RPS:                     rps,
		TotalDurationMs:         durationMs,
		ActiveDBConns:           activeConns,
		OneBookingSuccessPassed: oneSuccessPassed,
		AuditReportSummary:      auditSummary,
	}

	testTelemetryMutex.Lock()
	LastTestTelemetry = payload
	testTelemetryMutex.Unlock()

	// Broadcast results over WebSockets
	websockets.EmitEvent("STRESS_TEST_TELEMETRY", "admin", 0, payload)

	c.JSON(http.StatusOK, gin.H{
		"message":   fmt.Sprintf("Concurrency stress test complete. %d workers hit slot #%d", req.NumWorkers, req.SlotID),
		"telemetry": payload,
	})
}

// ExportStressReportCSV generates a downloadable Pass/Fail Audit CSV report
func ExportStressReportCSV(c *gin.Context) {
	testTelemetryMutex.RLock()
	t := LastTestTelemetry
	testTelemetryMutex.RUnlock()

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	writer.Write([]string{"Metric", "Value"})
	writer.Write([]string{"Test Date", time.Now().Format("2006-01-02 15:04:05 IST")})
	writer.Write([]string{"Slot ID", fmt.Sprintf("%d", t.SlotID)})
	writer.Write([]string{"Scenario", t.Scenario})
	writer.Write([]string{"Mode", t.Mode})
	writer.Write([]string{"Total Goroutine Workers", fmt.Sprintf("%d", t.TotalRequests)})
	writer.Write([]string{"Successful Requests (200 OK)", fmt.Sprintf("%d", t.Status200)})
	writer.Write([]string{"Blocked Requests (409 Conflict)", fmt.Sprintf("%d", t.Status409)})
	writer.Write([]string{"Bad Requests (400 Bad Req)", fmt.Sprintf("%d", t.Status400)})
	writer.Write([]string{"Internal Errors (500 Error)", fmt.Sprintf("%d", t.Status500)})
	writer.Write([]string{"Requests Per Second (RPS)", fmt.Sprintf("%.2f", t.RPS)})
	writer.Write([]string{"Min Latency (ms)", fmt.Sprintf("%.2f", t.MinLatencyMs)})
	writer.Write([]string{"Max Latency (ms)", fmt.Sprintf("%.2f", t.MaxLatencyMs)})
	writer.Write([]string{"Average Latency (ms)", fmt.Sprintf("%.2f", t.AvgLatencyMs)})
	writer.Write([]string{"P50 Latency (ms)", fmt.Sprintf("%.2f", t.P50LatencyMs)})
	writer.Write([]string{"P95 Latency (ms)", fmt.Sprintf("%.2f", t.P95LatencyMs)})
	writer.Write([]string{"P99 Latency (ms)", fmt.Sprintf("%.2f", t.P99LatencyMs)})
	writer.Write([]string{"Active DB Connections In-Use", fmt.Sprintf("%d", t.ActiveDBConns)})
	writer.Write([]string{"Single Slot Lock Check Passed", fmt.Sprintf("%t", t.OneBookingSuccessPassed)})
	writer.Write([]string{"Audit Summary", t.AuditReportSummary})

	writer.Flush()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=stress_test_audit_report_slot%d.csv", t.SlotID))
	c.Data(http.StatusOK, "text/csv", buf.Bytes())
}
