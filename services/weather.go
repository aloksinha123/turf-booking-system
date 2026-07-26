package services

import (
	"encoding/json"
	"net/http"
	"time"
)

var (
	IsRaining        bool
	LastCheck        time.Time
	CachedWeatherMultiplier float64 = 1.0
)

// UpdateWeatherState checks the Live Weather from Open-Meteo
func UpdateWeatherState() {
	// Cache for 15 minutes to avoid rate limits
	if time.Since(LastCheck) < 15*time.Minute && !LastCheck.IsZero() {
		return
	}

	// Mumbai coordinates
	resp, err := http.Get("https://api.open-meteo.com/v1/forecast?latitude=19.0760&longitude=72.8777&current_weather=true")
	if err != nil {
		return // Silently fail and use previous cache
	}
	defer resp.Body.Close()

	var data struct {
		CurrentWeather struct {
			WeatherCode int `json:"weathercode"`
		} `json:"current_weather"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		// WMO Weather codes: 50+ usually implies drizzle, rain, snow, or storm.
		code := data.CurrentWeather.WeatherCode
		if code >= 50 && code <= 99 {
			IsRaining = true
			CachedWeatherMultiplier = 0.7 // Monsoon Discount
		} else {
			IsRaining = false
			CachedWeatherMultiplier = 1.0
		}
		LastCheck = time.Now()
	}
}

func GetWeatherMultiplier() (float64, bool) {
	UpdateWeatherState()
	return CachedWeatherMultiplier, IsRaining
}
