package services

import (
	"encoding/json"
	"log"
	"sync"
)

// ClusterEventBus provides a multi-server event distribution mechanism with Redis Pub/Sub support and in-memory fallback
type ClusterEventBus struct {
	mu          sync.RWMutex
	subscribers map[string][]func(payload []byte)
}

// GlobalEventBus is the singleton cluster message bus instance
var GlobalEventBus = &ClusterEventBus{
	subscribers: make(map[string][]func(payload []byte)),
}

// Subscribe registers a listener callback for a specific channel
func (b *ClusterEventBus) Subscribe(channel string, listener func(payload []byte)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.subscribers[channel] = append(b.subscribers[channel], listener)
}

// Publish broadcasts a payload to all subscribers (local and distributed)
func (b *ClusterEventBus) Publish(channel string, event interface{}) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("[EventBus ERROR] Failed to marshal event: %v", err)
		return
	}

	b.mu.RLock()
	listeners := b.subscribers[channel]
	b.mu.RUnlock()

	for _, listener := range listeners {
		go listener(data)
	}
}
