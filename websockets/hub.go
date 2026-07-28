package websockets

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var JwtSecretKey = []byte("super_secret_turf_key_2026")

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for testing
	},
}

// WSEvent defines structured event payloads broadcast across WebSockets
type WSEvent struct {
	SeqID        uint64      `json:"seq_id"`               // Monotonically increasing sequence ID
	Type         string      `json:"type"`                 // e.g. "SLOT_UPDATED", "BOOKING_CREATED", "ONLINE_COUNT_UPDATE"
	TargetRole   string      `json:"target_role,omitempty"` // "admin", "customer", "" (all)
	UserID       uint        `json:"user_id,omitempty"`     // Target specific user ID (0 = all)
	Payload      interface{} `json:"payload"`
	IsCompressed bool        `json:"is_compressed,omitempty"`
	Timestamp    string      `json:"timestamp"`
}

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan WSEvent
	Register   chan *Client
	Unregister chan *Client
	mu         sync.Mutex
}

// GlobalHub is the singleton instance of our WebSocket Hub
var GlobalHub = &Hub{
	Broadcast:  make(chan WSEvent),
	Register:   make(chan *Client),
	Unregister: make(chan *Client),
	Clients:    make(map[*Client]bool),
}

// Run starts the event broadcast loop and online user tracking
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			onlineCount := len(h.Clients)
			h.mu.Unlock()

			log.Printf("WebSocket Client Connected [User: %d, Role: %s]. Total Online: %d", client.UserID, client.Role, onlineCount)
			h.BroadcastOnlineCount(onlineCount)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
			}
			onlineCount := len(h.Clients)
			h.mu.Unlock()

			log.Printf("WebSocket Client Disconnected [User: %d]. Total Online: %d", client.UserID, onlineCount)
			h.BroadcastOnlineCount(onlineCount)

		case event := <-h.Broadcast:
			if event.Timestamp == "" {
				event.Timestamp = time.Now().Format(time.RFC3339)
			}

			// Assign monotonic sequence versioning and store in replay ring buffer
			GlobalReplayStore.AddEvent(&event)

			data, err := json.Marshal(event)
			if err != nil {
				log.Printf("Failed to marshal WSEvent: %v", err)
				continue
			}

			h.mu.Lock()
			for client := range h.Clients {
				// Filter by target user ID if set
				if event.UserID != 0 && client.UserID != event.UserID {
					continue
				}

				// Filter by target role if set
				if event.TargetRole != "" && client.Role != event.TargetRole && client.Role != "admin" {
					continue
				}

				select {
				case client.Send <- data:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// BroadcastOnlineCount notifies all clients of the current active user count
func (h *Hub) BroadcastOnlineCount(count int) {
	event := WSEvent{
		Type:      "ONLINE_COUNT_UPDATE",
		Timestamp: time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"online_users": count,
		},
	}
	data, _ := json.Marshal(event)

	h.mu.Lock()
	for client := range h.Clients {
		select {
		case client.Send <- data:
		default:
		}
	}
	h.mu.Unlock()
}

// Emit Event Helper
func EmitEvent(eventType string, targetRole string, userID uint, payload interface{}) {
	GlobalHub.Broadcast <- WSEvent{
		Type:       eventType,
		TargetRole: targetRole,
		UserID:     userID,
		Payload:    payload,
		Timestamp:  time.Now().Format(time.RFC3339),
	}
}

// ServeWS handles WebSocket upgrading and JWT authentication handshake
func ServeWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	// Extract token from query param ?token=... or header
	tokenStr := c.Query("token")
	if tokenStr == "" {
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	userID := uint(0)
	role := "guest"

	if tokenStr != "" {
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return JwtSecretKey, nil
		})

		if err == nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				if idVal, ok := claims["user_id"].(float64); ok {
					userID = uint(idVal)
				}
				if rVal, ok := claims["role"].(string); ok {
					role = rVal
				}
			}
		}
	}

	client := &Client{
		Hub:    GlobalHub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		UserID: userID,
		Role:   role,
	}

	GlobalHub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
