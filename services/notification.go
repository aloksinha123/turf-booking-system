package services

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"turf-booking-system/models"
)

// SendWhatsAppMessage sends a WhatsApp/SMS via Twilio. Falls back to console if keys are missing.
func SendWhatsAppMessage(toPhone string, message string) {
	accountSid := os.Getenv("TWILIO_ACCOUNT_SID")
	authToken := os.Getenv("TWILIO_AUTH_TOKEN")
	fromPhone := os.Getenv("TWILIO_FROM_PHONE")

	if accountSid == "" || authToken == "" || fromPhone == "" {
		// Fallback to Mock Logger Implementation
		fmt.Println("\n==================================================")
		fmt.Println("📲 [MOCK WHATSAPP NOTIFICATION ENGINE]")
		fmt.Printf("📍 TO: %s\n", toPhone)
		fmt.Println("--------------------------------------------------")
		indentedMsg := strings.ReplaceAll(message, "\n", "\n   ")
		fmt.Printf("   %s\n", indentedMsg)
		fmt.Println("==================================================\n")
		return
	}

	// Format To Phone (Twilio Sandbox requires whatsapp: prefix)
	if !strings.HasPrefix(toPhone, "whatsapp:") {
		toPhone = "whatsapp:" + strings.ReplaceAll(toPhone, " ", "")
	}
	if !strings.HasPrefix(fromPhone, "whatsapp:") {
		fromPhone = "whatsapp:" + strings.ReplaceAll(fromPhone, " ", "")
	}

	urlStr := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", accountSid)
	
	v := url.Values{}
	v.Set("To", toPhone)
	v.Set("From", fromPhone)
	v.Set("Body", message)
	
	req, err := http.NewRequest("POST", urlStr, strings.NewReader(v.Encode()))
	if err != nil {
		fmt.Println("Error creating Twilio request:", err)
		return
	}
	
	req.SetBasicAuth(accountSid, authToken)
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending message to Twilio:", err)
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		fmt.Printf("✅ WhatsApp message sent successfully to %s\n", toPhone)
	} else {
		fmt.Printf("❌ Failed to send WhatsApp message to %s (Status: %s)\n", toPhone, resp.Status)
	}
}

// SendBookingInvoice sends the initial confirmation to the customer and admin
func SendBookingInvoice(booking *models.Booking) {
	if booking.User.Phone == "" {
		booking.User.Phone = "+91 9876543210" // Mock fallback
	}

	customerMsg := fmt.Sprintf(`Hi %s, 
Your booking is CONFIRMED! 🎉

🏟️ Turf: Bovox Arena
⏰ Time: %s
💰 Amount Paid: ₹%.2f
📝 Booking ID: #%03d

Thank you for choosing us. Get ready for the match! ⚽🏏`, 
		booking.User.Name, booking.Slot.StartTime, booking.FinalAmount, booking.ID)

	adminMsg := fmt.Sprintf(`🔔 NEW BOOKING ALERT
User: %s (%s)
Turf: Bovox Arena
Time: %s
Amount: ₹%.2f
Booking ID: #%03d`, 
		booking.User.Name, booking.User.Phone, booking.Slot.StartTime, booking.FinalAmount, booking.ID)

	// Send to Customer
	SendWhatsAppMessage(booking.User.Phone, customerMsg)
	// Send to Admin (Hardcoded mock admin number)
	SendWhatsAppMessage("+91 8888888888", adminMsg)
}

// SendMatchReminder sends the 2-hour early reminder
func SendMatchReminder(booking *models.Booking) {
	if booking.User.Phone == "" {
		booking.User.Phone = "+91 9876543210" // Mock fallback
	}

	reminderMsg := fmt.Sprintf(`⏰ MATCH REMINDER
Hi %s, your match at Bovox Arena starts at %s. 

Don't be late! Make sure your squad is ready! ⚡🏏`, 
		booking.User.Name, booking.Slot.StartTime)

	SendWhatsAppMessage(booking.User.Phone, reminderMsg)
}
