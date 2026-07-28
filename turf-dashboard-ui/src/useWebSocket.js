import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Enterprise Production WebSocket Hook
 * Features:
 * - JWT authentication handshake
 * - Exponential backoff auto-reconnection
 * - Ping/Pong heartbeat listener
 * - Graceful fallback to 5s HTTP polling if WS fails
 * - Live online user count tracking
 * - Floating Toast notifications for events
 * - Typed event dispatchers for partial state updates
 */
export function useWebSocket({ wsUrl, token, onEvent, onFallbackPoll }) {
  const [status, setStatus] = useState('reconnecting'); // 'connected' | 'reconnecting' | 'polling'
  const [onlineCount, setOnlineCount] = useState(1);
  const [toasts, setToasts] = useState([]);
  const wsRef = useRef(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Helper to add toast notification
  const addToast = useCallback((title, message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-4), { id, title, message, type }]); // Keep max 5 toasts
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    // Clear any active polling fallback
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    const fullUrl = token ? `${wsUrl}?token=${token}` : wsUrl;
    setStatus('reconnecting');

    try {
      const socket = new WebSocket(fullUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        attemptsRef.current = 0;
      };

      socket.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          // Handle Heartbeat Ping
          if (event.type === 'PING') {
            socket.send(JSON.stringify({ type: 'PONG' }));
            return;
          }

          // Handle Live Online Count Update
          if (event.type === 'ONLINE_COUNT_UPDATE') {
            if (event.payload && event.payload.online_users) {
              setOnlineCount(event.payload.online_users);
            }
            return;
          }

          // Trigger Toast Notifications based on Event Types
          switch (event.type) {
            case 'BOOKING_CREATED':
              addToast('🎉 New Booking Created!', `Booking #${event.payload?.booking_id || ''} confirmed`, 'success');
              break;
            case 'PRICE_CHANGED':
              addToast('⚡ Dynamic Fare Updated', `Slot price changed to ₹${event.payload?.new_price || 'dynamic'}`, 'warning');
              break;
            case 'SLOT_UPDATED':
              addToast('🔄 Slot State Updated', `Inventory slot #${event.payload?.slot_id || ''} updated`, 'info');
              break;
            case 'MATCHMAKING_UPDATED':
              addToast('🏆 Match Squad Update', `Player joined matchmaking match #${event.payload?.match_id || ''}`, 'purple');
              break;
            case 'SYSTEM_MAINTENANCE':
              addToast('🔧 Maintenance Mode Alert', event.payload?.reason || 'System maintenance in progress', 'danger');
              break;
            default:
              break;
          }

          // Invoke custom event listener for partial state updates
          if (onEvent) {
            onEvent(event);
          }
        } catch (err) {
          console.error("WS Message parse error:", err);
        }
      };

      socket.onclose = () => {
        wsRef.current = null;
        attemptsRef.current += 1;

        if (attemptsRef.current > 3) {
          // Fallback to Polling
          setStatus('polling');
          addToast('⚠️ Connection Lost', 'Switching to HTTP Polling fallback mode', 'warning');
          if (onFallbackPoll && !pollIntervalRef.current) {
            onFallbackPoll(); // Run immediate poll
            pollIntervalRef.current = setInterval(() => {
              onFallbackPoll();
            }, 5000);
          }
        } else {
          // Exponential backoff reconnect: 1s, 2s, 4s...
          const delay = Math.min(1000 * Math.pow(2, attemptsRef.current - 1), 8000);
          setStatus('reconnecting');
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch (err) {
      console.error("WS connection attempt failed:", err);
    }
  }, [wsUrl, token, onEvent, onFallbackPoll, addToast]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return {
    status,
    onlineCount,
    toasts,
    removeToast,
    addToast
  };
}
