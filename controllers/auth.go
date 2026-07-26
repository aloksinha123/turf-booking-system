package controllers

import (
	"net/http"
	"turf-booking-system/config"
	"turf-booking-system/middlewares"
	"turf-booking-system/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login Controller - Validates credentials and generates a JWT
func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Valid email and password required"})
		return
	}

	var user models.User
	// Find user by email
	if err := config.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Compare the provided password with the stored hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Password is valid, generate JWT Token
	token, err := middlewares.GenerateToken(user.ID, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate authentication token"})
		return
	}

	// Set secure HttpOnly cookie
	c.SetCookie("jwt", token, 3600*72, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"token":   token,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

// CustomerLoginRequest for mobile/OTP login
type CustomerLoginRequest struct {
	Phone string `json:"phone" binding:"required"`
	OTP   string `json:"otp" binding:"required"`
}

// CustomerLogin - Mocks an OTP verification and issues JWT
func CustomerLogin(c *gin.Context) {
	var req CustomerLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Phone number and OTP required"})
		return
	}

	// Mock OTP Validation (In real life, verify with Twilio/Firebase)
	if req.OTP != "1234" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid OTP. Use 1234 for testing."})
		return
	}

	var user models.User
	// Check if customer exists, else create them (Auto-Signup)
	if err := config.DB.Where("phone = ?", req.Phone).First(&user).Error; err != nil {
		// Create new customer
		user = models.User{
			Phone: req.Phone,
			Name:  "Player_" + req.Phone[len(req.Phone)-4:], // Generate a mock name
			Email: "player_" + req.Phone + "@example.com",   // Dummy email to prevent unique constraint crash
			Role:  "customer",
		}
		if err := config.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create customer account"})
			return
		}
	}

	// Generate JWT Token
	token, err := middlewares.GenerateToken(user.ID, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Set secure HttpOnly cookie
	c.SetCookie("jwt", token, 3600*72, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"token":   token,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"phone": user.Phone,
			"role":  user.Role,
		},
	})
}

// Logout clears the secure jwt cookie
func Logout(c *gin.Context) {
	c.SetCookie("jwt", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}
