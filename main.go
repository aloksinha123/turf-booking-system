package main

import (
	"net/http"
	"turf-booking-system/config"
	"turf-booking-system/controllers"
	"turf-booking-system/cron"
	"turf-booking-system/middlewares"
	"turf-booking-system/websockets"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database Cluster
	config.ConnectDatabase()

	// Run Database Seeder
	config.SeedDatabase()

	// Start Background Engines
	cron.StartReminderCron()
	cron.StartSplitExpiryCron()
	cron.StartMatchmakingExpiryCron()
	go websockets.GlobalHub.Run()

	router := gin.Default()
	// Is block ko router := gin.Default() ke theek niche paste karein
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Auth Routes
	router.POST("/auth/login", controllers.Login)
	router.POST("/auth/login/customer", controllers.CustomerLogin)
	router.POST("/auth/logout", controllers.Logout)

	// General Health Check Verification Handler
	router.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "Turf Backend Engine is up and running smoothly!",
		})
	})

	// Webhooks
	router.POST("/webhooks/payment", controllers.HandlePaymentWebhook) // Legacy fallback
	router.POST("/webhooks/stripe", controllers.HandleStripeWebhook)   // Official Stripe hook

	// Split Payments
	router.GET("/api/v1/splits/verify/:token", controllers.VerifySplitToken)

	// Public Route
	router.GET("/slots/available", controllers.GetAvailableSlots)
	router.GET("/api/v1/turfs/:id/slots", controllers.GetTurfSlotsWithPredictivePricing)

	// WebSockets
	router.GET("/ws", websockets.ServeWS)

	// Protected Routes
	customerRoutes := router.Group("/")
	customerRoutes.Use(middlewares.IsCustomer())
	{
		customerRoutes.POST("/slots/book", controllers.CreateBooking)
		customerRoutes.GET("/user/bookings", controllers.GetUserBookings)
	}

	// Admin Protected Routes
	adminRoutes := router.Group("/admin")
	adminRoutes.Use(middlewares.IsAdmin())
	{
		adminRoutes.GET("/slots", controllers.GetAllSlotsForAdmin)
		adminRoutes.POST("/lock", controllers.ToggleSlotLock)
		adminRoutes.POST("/multiplier", controllers.UpdatePricingMultiplier)
		adminRoutes.GET("/analytics", controllers.GetAdminAnalytics)
		adminRoutes.POST("/slots/generate", controllers.GenerateDailySlots)
		adminRoutes.PUT("/slots/:id/price", controllers.UpdateSlotPrice)
		adminRoutes.POST("/seed_demo", controllers.SeedDemoAnalytics)
		
		// Dev/Test: Stress test & reset all slots
		adminRoutes.POST("/api/v1/test/stress", controllers.RunStressTest)
		adminRoutes.POST("/slots/reset", func(c *gin.Context) {
			config.DB.Exec("UPDATE slots SET is_booked = false, is_locked = false")
			config.DB.Exec("DELETE FROM bookings")
			c.JSON(http.StatusOK, gin.H{
				"message": "Database application state reset successfully!",
			})
		})
	}

	router.Run(":8085")
}
