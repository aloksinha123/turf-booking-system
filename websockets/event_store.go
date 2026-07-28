package websockets

import (
	"sync"
	"sync/atomic"
)

const MaxReplayBufferSize = 500

// EventReplayStore manages monotonic sequence IDs and ring buffer replay for reconnection catchup
type EventReplayStore struct {
	mu         sync.RWMutex
	currentSeq uint64
	ringBuffer []WSEvent
}

// GlobalReplayStore is the singleton instance managing event versioning and replay history
var GlobalReplayStore = &EventReplayStore{
	currentSeq: 0,
	ringBuffer: make([]WSEvent, 0, MaxReplayBufferSize),
}

// AddEvent assigns a monotonically increasing sequence ID (seq_id) and pushes to the replay buffer
func (s *EventReplayStore) AddEvent(event *WSEvent) uint64 {
	newSeq := atomic.AddUint64(&s.currentSeq, 1)
	event.SeqID = newSeq

	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.ringBuffer) >= MaxReplayBufferSize {
		s.ringBuffer = s.ringBuffer[1:] // Evict oldest event
	}
	s.ringBuffer = append(s.ringBuffer, *event)

	return newSeq
}

// GetEventsSince returns all missed events since the specified lastSeq ID
func (s *EventReplayStore) GetEventsSince(lastSeq uint64) []WSEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var missed []WSEvent
	for _, event := range s.ringBuffer {
		if event.SeqID > lastSeq {
			missed = append(missed, event)
		}
	}
	return missed
}
