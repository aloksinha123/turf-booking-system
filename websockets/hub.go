package websockets

import (
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for testing
	},
}

// Hub maintains the set of active clients and broadcasts messages to the clients.
type Hub struct {
	// Registered clients.
	Clients map[*websocket.Conn]bool

	// Broadcast channel.
	Broadcast chan interface{}

	// Mutex for thread-safe access to the Clients map
	mu sync.Mutex
}

// GlobalHub is the singleton instance of our WebSocket Hub
var GlobalHub = &Hub{
	Broadcast: make(chan interface{}),
	Clients:   make(map[*websocket.Conn]bool),
}

// Run starts the WebSocket hub broadcast loop
func (h *Hub) Run() {
	for {
		message := <-h.Broadcast
		h.mu.Lock()
		for client := range h.Clients {
			err := client.WriteJSON(message)
			if err != nil {
				log.Printf("WebSocket error: %v", err)
				client.Close()
				delete(h.Clients, client)
			}
		}
		h.mu.Unlock()
	}
}

// ServeWS handles WebSocket requests from the peer.
func ServeWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	// Register client
	GlobalHub.mu.Lock()
	GlobalHub.Clients[conn] = true
	GlobalHub.mu.Unlock()

	log.Println("Client connected to WebSocket Hub. Active Clients:", len(GlobalHub.Clients))

	// Listen for client disconnects
	go func() {
		defer func() {
			GlobalHub.mu.Lock()
			delete(GlobalHub.Clients, conn)
			GlobalHub.mu.Unlock()
			conn.Close()
			log.Println("Client disconnected. Active Clients:", len(GlobalHub.Clients))
		}()
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}()
}
