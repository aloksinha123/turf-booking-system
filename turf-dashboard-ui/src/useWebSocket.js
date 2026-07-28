import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Enterprise Production WebSocket & Event Replay Hook
 * Features:
 * - Monotonic Sequence Versioning (seq_id) & Deduplication
 * - Automatic Message Acknowledgements (ACK)
 * - Event Replay Catchup Sync on Reconnect (/ws/replay?last_seq_id=X)
 * - Page Visibility API listener for Tab Wake Catchup Sync
 * - Exponential backoff auto-reconnection
 * - Heartbeat Ping/Pong listener
 * - Graceful 5s HTTP polling fallback
 * - Live online user count tracking
 * - Floating Toast notifications for events
 */
export function useWebSocket({ wsUrl, token, onEvent, onFallbackPoll }) {
  const [status, setStatus] = useState('reconnecting'); // 'connected' | 'reconnecting' | 'polling'
  const [onlineCount, setOnlineCount] = useState(1);
  const [toasts, setToasts] = useState([]);
  const wsRef = useRef(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const lastSeqIdRef = useRef(0);

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

  // Fetch missed events during disconnection or tab sleep
  const triggerReplayCatchup = useCallback(async () => {
    try {
      const res = await fetch(`http://localhost:8085/ws/replay?last_seq_id=${lastSeqIdRef.current}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.events && data.events.length > 0) {
        console.log(`[WS Replay] Replaying ${data.events.length} missed events since seq #${lastSeqIdRef.current}`);
        data.events.forEach((evt) => {
          if (evt.seq_id > lastSeqIdRef.current) {
            lastSeqIdRef.current = evt.seq_id;
            if (onEvent) onEvent(evt);
          }
        });
        addToast('⚡ Sync Complete', `Replayed ${data.events.length} missed event updates`, 'info');
      }
    } catch (err) {
      console.warn("Event replay catchup error:", err);
    }
  }, [onEvent, addToast]);

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

        // Perform event catchup sync on reconnect
        if (lastSeqIdRef.current > 0) {
          triggerReplayCatchup();
        }
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

          // Sequence Versioning & Deduplication
          if (event.seq_id) {
            if (event.seq_id <= lastSeqIdRef.current) {
              console.log(`[WS Deduplicate] Dropping duplicate seq_id #${event.seq_id}`);
              return; // Ignore duplicate
            }
            lastSeqIdRef.current = event.seq_id;

            // Send ACK message to backend
            socket.send(JSON.stringify({ type: 'ACK', seq_id: event.seq_id }));
          }

          // Trigger Toast Notifications based on Event Types
          switch (event.type) {
            case 'BOOKING_CREATED':
              addToast('🎉 New Booking Created!', `Seq #${event.seq_id || ''} - Booking #${event.payload?.booking_id || ''} confirmed`, 'success');
              break;
            case 'PRICE_CHANGED':
              addToast('⚡ Dynamic Fare Updated', `Seq #${event.seq_id || ''} - Price updated`, 'warning');
              break;
            case 'SLOT_UPDATED':
              addToast('🔄 Slot State Updated', `Seq #${event.seq_id || ''} - Slot #${event.payload?.slot_id || ''} updated`, 'info');
              break;
            case 'MATCHMAKING_UPDATED':
              addToast('🏆 Match Squad Update', `Seq #${event.seq_id || ''} - Match #${event.payload?.match_id || ''} updated`, 'purple');
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
  }, [wsUrl, token, onEvent, onFallbackPoll, addToast, triggerReplayCatchup]);

  // Tab Wake Catchup Sync via Page Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("[Tab Wake] Browser tab active. Triggering catchup sync...");
        triggerReplayCatchup();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerReplayCatchup]);

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
    lastSeqId: lastSeqIdRef.current,
    toasts,
    removeToast,
    addToast
  };
}
