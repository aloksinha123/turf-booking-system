package middlewares

import (
	"fmt"
	"net/http"
	"strings"
	"time"
	"turf-booking-system/config"
	"turf-booking-system/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Secret Key for JWT Signing (In production, load this from .env)
var JwtSecretKey = []byte("super_secret_turf_key_2026")

// GenerateToken generates a JWT token for the authenticated user
func GenerateToken(userID uint, role string) (string, error) {
	// Create the JWT claims, which includes the user ID and role
	claims := jwt.MapClaims{
		"user_id": userID,
		"role":    role,
		"exp":     time.Now().Add(time.Hour * 72).Unix(), // Token expires in 72 hours
	}

	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token and return
	return token.SignedString(JwtSecretKey)
}

func validateAndExtractClaims(c *gin.Context) (jwt.MapClaims, error) {
	var tokenString string

	// 1. Try to get token from HttpOnly cookie
	cookie, err := c.Cookie("jwt")
	if err == nil && cookie != "" {
		tokenString = cookie
	} else {
		// 2. Fallback to Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}
	}

	if tokenString == "" {
		return nil, fmt.Errorf("Authorization token missing")
	}

	// Parse the token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("Unexpected signing method: %v", token.Header["alg"])
		}
		return JwtSecretKey, nil
	})

	if err != nil || !token.Valid {
		return nil, fmt.Errorf("Invalid or expired token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("Could not extract claims")
	}

	return claims, nil
}

// IsCustomer middleware validates token and allows 'customer' or 'admin'
func IsCustomer() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, err := validateAndExtractClaims(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		role, ok := claims["role"].(string)
		if !ok || (role != "customer" && role != "admin") {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied. Minimum role 'customer' required."})
			c.Abort()
			return
		}

		userID := uint(claims["user_id"].(float64))
		var user models.User
		if err := config.DB.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired or user deleted. Please log in again."})
			c.Abort()
			return
		}

		// Store user data in context for subsequent handlers
		c.Set("user_id", userID)
		c.Set("role", role)
		c.Next()
	}
}

// IsAdmin middleware validates token and strictly allows 'admin' only
func IsAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, err := validateAndExtractClaims(c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		role, ok := claims["role"].(string)
		if !ok || role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access strictly required."})
			c.Abort()
			return
		}

		userID := uint(claims["user_id"].(float64))
		var user models.User
		if err := config.DB.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired or user deleted. Please log in again."})
			c.Abort()
			return
		}

		// Store user data in context for subsequent handlers
		c.Set("user_id", userID)
		c.Set("role", role)
		c.Next()
	}
}
