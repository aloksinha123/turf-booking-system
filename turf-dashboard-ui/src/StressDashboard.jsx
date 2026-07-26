import { fetchApi } from './apiClient';
import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart 
} from 'recharts';

export default function StressDashboard({ apiBase, token, onTestComplete }) {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectDelay, setReconnectDelay] = useState(0);
  const [stats, setStats] = useState({
    activeDBConns: 0,
    successful: 0,
    failed: 0,
    avgLatencyMs: 0
  });
  
  const [chartData, setChartData] = useState([]);
  const [isTriggering, setIsTriggering] = useState(false);
  const [eventLogs, setEventLogs] = useState([]);
  const logEndRef = useRef(null);

  // Auto-scroll event log
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [eventLogs]);

  useEffect(() => {
    // Determine WS URL from apiBase
    const wsUrl = apiBase.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    
    let ws = null;
    let reconnectTimeout = null;
    let reconnectAttempts = 0;

    const addLog = (type, message) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      setEventLogs(prev => {
        const newLogs = [...prev, { timestamp, type, message, id: Date.now() + Math.random() }];
        if (newLogs.length > 50) newLogs.shift();
        return newLogs;
      });
    };

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts = 0;
        setReconnectDelay(0);
        addLog('CONNECT', `WebSocket established → ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (payload.event === "STRESS_TEST_RESULT") {
            // Update Stats Cards
            setStats({
              activeDBConns: payload.active_db_conns,
              successful: payload.successful,
              failed: payload.failed,
              avgLatencyMs: payload.avg_latency_ms.toFixed(2)
            });

            // Update Chart (keeping last 20 points)
            setChartData(prev => {
              const newData = [...prev, {
                time: new Date().toLocaleTimeString('en-US', { hour12: false }),
                latency: payload.avg_latency_ms,
                connections: payload.active_db_conns,
                tps: payload.successful + payload.failed
              }];
              if (newData.length > 20) newData.shift();
              return newData;
            });

            // Add detailed event logs
            addLog('STRESS_RESULT', `Burst complete → ${payload.successful} OK / ${payload.failed} BLOCKED | Latency: ${payload.avg_latency_ms.toFixed(2)}ms | Pool: ${payload.active_db_conns} conns`);
            
            if (payload.failed > 0) {
              addLog('ROW_LOCK', `ROW_LOCK_CONTENTION: ${payload.failed} transactions blocked by concurrent write locks`);
            }
            if (payload.successful > 0) {
              addLog('TX_COMMIT', `TX_COMMIT_BATCH: ${payload.successful} transactions committed successfully`);
            }
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
          addLog('ERROR', `Parse error: ${e.message}`);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectAttempts++;
        // Exponential backoff: 1s, 2s, 4s, 8s, up to max 16s
        const nextDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 16000);
        setReconnectDelay(nextDelay / 1000);
        addLog('DISCONNECT', `Connection lost. Reconnecting in ${nextDelay / 1000}s (attempt #${reconnectAttempts})`);
        
        reconnectTimeout = setTimeout(connect, nextDelay);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [apiBase]);

  const triggerStressTest = async () => {
    setIsTriggering(true);
    setEventLogs(prev => [...prev, { 
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), 
      type: 'TRIGGER', 
      message: 'Initiating 50x concurrent booking burst → Slot ID 1...', 
      id: Date.now() 
    }]);
    
    try {
      const response = await fetchApi(`${apiBase}/admin/api/v1/test/stress`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ slot_id: 1 })
      });
      if (response.ok && onTestComplete) {
        onTestComplete();
      }
    } catch (err) {
      console.error("Stress test request failed:", err);
      setEventLogs(prev => [...prev, { 
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), 
        type: 'ERROR', 
        message: `Stress test API call failed: ${err.message}`, 
        id: Date.now() 
      }]);
    } finally {
      setIsTriggering(false);
    }
  };

  const resetPool = () => {
    setStats({ activeDBConns: 0, successful: 0, failed: 0, avgLatencyMs: 0 });
    setChartData([]);
    setEventLogs(prev => [...prev, { 
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), 
      type: 'RESET', 
      message: 'Connection pool metrics & chart data cleared.', 
      id: Date.now() 
    }]);
  };

  // Derive TPS from stats
  const tps = stats.successful + stats.failed;
  const lockWait = stats.avgLatencyMs > 0 ? (stats.avgLatencyMs * 0.15).toFixed(1) : '0.0';

  // Log type color map
  const logColors = {
    CONNECT: 'text-emerald-400',
    DISCONNECT: 'text-amber-400',
    STRESS_RESULT: 'text-cyan-400',
    ROW_LOCK: 'text-rose-400',
    TX_COMMIT: 'text-emerald-400',
    TRIGGER: 'text-purple-400',
    RESET: 'text-slate-400',
    ERROR: 'text-rose-500',
  };

  return (
    <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-md relative overflow-hidden">

      {/* ═══════════════════════════════════════════════════════ */}
      {/* HEADER                                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="p-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2.5">
            <span className="text-lg">⚡</span>
            Concurrency Engine & Database Pool Telemetry
          </h2>
          <p className="text-[10px] text-slate-500 font-semibold mt-1 flex items-center gap-2 ml-7">
            <span className="relative flex h-2 w-2">
              {isConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_#10b981]"></span>
                </>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 shadow-[0_0_6px_#f59e0b]"></span>
                </>
              )}
            </span>
            {isConnected ? (
              <span className="text-slate-400">WebSocket: <span className="text-emerald-400 font-black">Connected</span> <span className="text-slate-600">(Live Stream)</span></span>
            ) : (
              <span className="text-amber-400 font-bold">
                Reconnecting to telemetry stream... {reconnectDelay > 0 ? `(${reconnectDelay}s)` : ''}
              </span>
            )}
          </p>
        </div>
        
        {/* Action Control Panel */}
        <div className="flex items-center gap-3">
          <button
            onClick={resetPool}
            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 shadow-sm text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all cursor-pointer active:scale-95"
          >
            ♻️ Reset Pool
          </button>
          <button 
            onClick={triggerStressTest}
            disabled={isTriggering || !isConnected}
            className="relative bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-slate-900 text-[10px] font-black uppercase tracking-wider px-5 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_20px_rgba(225,29,72,0.25)] hover:shadow-[0_0_30px_rgba(225,29,72,0.4)]"
          >
            🔥 {isTriggering ? 'Executing Burst...' : 'Trigger 50x Stress Test'}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* KEY SYSTEM METRICS BAR                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200">
        
        {/* Active DB Connection Pool */}
        <div className="bg-white p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Active DB Pool</span>
            <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-2xl font-black text-slate-900">{stats.activeDBConns}</h3>
            <span className="text-[10px] text-slate-400 font-bold">conns</span>
          </div>
          <div className="mt-2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${Math.min((stats.activeDBConns / 50) * 100, 100)}%` }}></div>
          </div>
          <p className="text-[8px] text-indigo-400/70 font-bold mt-1.5">PostgreSQL connections</p>
        </div>

        {/* Row Lock Contention */}
        <div className="bg-white p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Blocked by Locks</span>
            <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-2xl font-black text-slate-900">{tps}</h3>
            <span className="text-[10px] text-slate-400 font-bold">req/sec</span>
          </div>
          <p className="text-[8px] text-amber-400/70 font-bold mt-3">Avg row-level lock acquisition</p>
        </div>

        {/* Transactions Handled/Sec */}
        <div className="bg-white p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Transactions/Sec</span>
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-2xl font-black text-emerald-600">{tps}</h3>
            <span className="text-xs text-slate-400 font-bold">TPS</span>
          </div>
          <div className="flex gap-3 mt-2">
            <span className="text-[8px] font-black text-emerald-500/70">✓ {stats.successful} OK</span>
            <span className="text-[8px] font-black text-rose-500/70">✗ {stats.failed} Blocked</span>
          </div>
        </div>

        {/* Throughput (TPS) */}
        <div className="bg-white p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Throughput (TPS)</span>
            <div className="w-6 h-6 rounded-md bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-2xl font-black text-slate-900">{stats.avgLatencyMs}</h3>
            <span className="text-[10px] text-slate-400 font-bold">ms</span>
          </div>
          <p className="text-[8px] text-cyan-400/70 font-bold mt-3">Avg execution per goroutine</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* LIVE GRAPH + EVENT LOG (Split Layout)                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-px bg-slate-200">
        
        {/* Live Graph (3/5 width) */}
        <div className="lg:col-span-3 bg-white p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span>
                Real-Time Latency & Connection Graph
              </h3>
              <p className="text-[9px] text-slate-600 font-semibold mt-0.5">Last 20 data points from WebSocket stream</p>
            </div>
            <div className="flex gap-3 text-[9px] font-black uppercase tracking-wider">
              <span className="flex items-center gap-1 text-indigo-400"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span> Latency</span>
              <span className="flex items-center gap-1 text-cyan-400"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span> Conns</span>
            </div>
          </div>
          
          <div className="h-56 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="connsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#334155" fontSize={9} tickMargin={8} />
                  <YAxis stroke="#334155" fontSize={9} tickFormatter={(val) => `${val}ms`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#111827', 
                      border: '1px solid #1e293b', 
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#64748b', fontWeight: 'bold', fontSize: '10px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="latency" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fill="url(#latencyGrad)"
                    dot={{ r: 3, fill: '#6366f1', strokeWidth: 2, stroke: '#ffffff' }}
                    activeDot={{ r: 5, stroke: '#6366f1', strokeWidth: 2 }}
                    name="Latency (ms)"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="connections" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    fill="url(#connsGrad)"
                    dot={{ r: 3, fill: '#06b6d4', strokeWidth: 2, stroke: '#0a0e17' }}
                    name="DB Conns"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-slate-600">
                <svg className="w-10 h-10 mb-3 text-slate-700" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                <span className="text-[10px] font-black uppercase tracking-wider">Awaiting telemetry data</span>
                <span className="text-[9px] font-semibold mt-1">Trigger a stress test to populate the graph</span>
              </div>
            )}
          </div>
        </div>

        {/* Real-Time Event Log (2/5 width) */}
        <div className="lg:col-span-2 bg-slate-50 p-5 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
              Live Event Stream
            </h3>
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-wider">{eventLogs.length} events</span>
          </div>

          {/* Terminal Console Window */}
          <div className="flex-1 bg-[#0a0e17] border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-inner">
            {/* Terminal title bar */}
            <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[8px] text-slate-600 font-bold ml-2 uppercase tracking-wider">telemetry://stdout</span>
            </div>

            {/* Scrollable log area */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed max-h-52 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {eventLogs.length === 0 ? (
                <div className="text-slate-500 flex items-center gap-2">
                  <span className="text-emerald-500">$</span> Waiting for telemetry events...
                </div>
              ) : (
                eventLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 py-0.5 hover:bg-slate-800/50">
                    <span className="text-slate-500 flex-shrink-0">[{log.timestamp}]</span>
                    <span className={`flex-shrink-0 font-black ${logColors[log.type] || 'text-slate-400'}`}>{log.type}:</span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Floating Reconnect Toast Notification */}
      {!isConnected && (
        <div className="absolute bottom-4 right-4 z-30 bg-[#111827]/95 border border-amber-500/30 px-4 py-2.5 rounded-xl shadow-[0_10px_30px_rgba(245,158,11,0.1)] flex items-center gap-2.5 backdrop-blur-md">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_6px_#f59e0b]"></span>
          </span>
          <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">
            Stream offline — reconnecting {reconnectDelay > 0 ? `in ${reconnectDelay}s` : 'now'}...
          </span>
        </div>
      )}
    </div>
  );
}
