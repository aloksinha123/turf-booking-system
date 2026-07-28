import { fetchApi } from './apiClient';
import React, { useState, useEffect, useRef } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart 
} from 'recharts';

export default function StressDashboard({ apiBase, token, onTestComplete }) {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectDelay, setReconnectDelay] = useState(0);
  const [numWorkers, setNumWorkers] = useState(500);
  const [slotId, setSlotId] = useState(1);
  const [scenario, setScenario] = useState('booking');
  const [mode, setMode] = useState('spike');

  const [stats, setStats] = useState({
    activeDBConns: 0,
    totalRequests: 0,
    successful: 0,
    failed: 0,
    status200: 0,
    status409: 0,
    status400: 0,
    status500: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    minLatencyMs: 0,
    maxLatencyMs: 0,
    rps: 0,
    oneBookingSuccessPassed: true,
    auditReportSummary: ''
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
    const wsUrl = apiBase.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    
    let ws = null;
    let reconnectTimeout = null;
    let reconnectAttempts = 0;

    const addLog = (type, message) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      setEventLogs(prev => {
        const newLogs = [...prev, { timestamp, type, message, id: Date.now() + Math.random() }];
        if (newLogs.length > 60) newLogs.shift();
        return newLogs;
      });
    };

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts = 0;
        setReconnectDelay(0);
        addLog('CONNECT', `WebSocket Telemetry Stream Connected → ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (payload.type === "STRESS_TEST_TELEMETRY" && payload.payload) {
            const data = payload.payload;
            
            // Update Stats Cards
            setStats({
              activeDBConns: data.active_db_conns,
              totalRequests: data.total_requests,
              successful: data.successful,
              failed: data.failed,
              status200: data.status_200,
              status409: data.status_409,
              status400: data.status_400,
              status500: data.status_500,
              avgLatencyMs: data.avg_latency_ms ? data.avg_latency_ms.toFixed(2) : 0,
              p50LatencyMs: data.p50_latency_ms ? data.p50_latency_ms.toFixed(2) : 0,
              p95LatencyMs: data.p95_latency_ms ? data.p95_latency_ms.toFixed(2) : 0,
              p99LatencyMs: data.p99_latency_ms ? data.p99_latency_ms.toFixed(2) : 0,
              minLatencyMs: data.min_latency_ms ? data.min_latency_ms.toFixed(2) : 0,
              maxLatencyMs: data.max_latency_ms ? data.max_latency_ms.toFixed(2) : 0,
              rps: data.rps ? data.rps.toFixed(1) : 0,
              oneBookingSuccessPassed: data.one_booking_success_passed,
              auditReportSummary: data.audit_report_summary || ''
            });

            // Update Chart
            setChartData(prev => {
              const newData = [...prev, {
                time: new Date().toLocaleTimeString('en-US', { hour12: false }),
                p50: data.p50_latency_ms,
                p95: data.p95_latency_ms,
                p99: data.p99_latency_ms,
                connections: data.active_db_conns,
                rps: data.rps
              }];
              if (newData.length > 20) newData.shift();
              return newData;
            });

            // Detailed Event Logs
            addLog('STRESS_RESULT', `Burst Result: ${data.total_requests} Workers | RPS: ${data.rps?.toFixed(1)} | P95: ${data.p95_latency_ms?.toFixed(2)}ms | 200 OK: ${data.status_200} | 409 Conflict: ${data.status_409}`);
            
            if (data.status_409 > 0) {
              addLog('ROW_LOCK', `ROW_LOCK_CONTENTION: ${data.status_409} concurrent requests blocked by SELECT FOR UPDATE lock`);
            }
            if (data.status_200 > 0) {
              addLog('TX_COMMIT', `TX_COMMIT_SUCCESS: ${data.status_200} atomic transaction(s) committed safely`);
            }
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectAttempts++;
        const nextDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 16000);
        setReconnectDelay(nextDelay / 1000);
        reconnectTimeout = setTimeout(connect, nextDelay);
      };

      ws.onerror = () => {};
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
      message: `Launching ${numWorkers}x Goroutine Workers → Scenario: ${scenario.toUpperCase()} | Mode: ${mode.toUpperCase()} | Slot #${slotId}...`, 
      id: Date.now() 
    }]);
    
    try {
      const response = await fetchApi(`${apiBase}/admin/api/v1/test/stress`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          slot_id: Number(slotId),
          num_workers: Number(numWorkers),
          scenario,
          mode
        })
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

  const handleExportCSVReport = () => {
    window.open(`${apiBase}/admin/api/v1/test/report/export`, '_blank');
  };

  const resetPool = () => {
    setStats({
      activeDBConns: 0,
      totalRequests: 0,
      successful: 0,
      failed: 0,
      status200: 0,
      status409: 0,
      status400: 0,
      status500: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      rps: 0,
      oneBookingSuccessPassed: true,
      auditReportSummary: ''
    });
    setChartData([]);
    setEventLogs(prev => [...prev, { 
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }), 
      type: 'RESET', 
      message: 'Telemetry metrics and chart data cleared.', 
      id: Date.now() 
    }]);
  };

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

      {/* HEADER & CONTROLS TOOLBAR */}
      <div className="p-6 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2.5">
            <span className="text-lg">⚡</span>
            Chaos & Concurrency Stress Engine (1,000 Workers Scale)
          </h2>
          <p className="text-[10px] text-slate-500 font-semibold mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Telemetry: <strong className="text-emerald-600">CONNECTED (Live Stream)</strong></span>
            <span className="text-slate-400">|</span>
            <span>Row-Level Lock Verification: <strong className="text-indigo-600">SELECT ... FOR UPDATE</strong></span>
          </p>
        </div>
        
        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSVReport}
            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 shadow-sm text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
          >
            📥 Export Audit CSV Report
          </button>

          <button
            onClick={resetPool}
            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 shadow-sm text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer"
          >
            ♻️ Reset Metrics
          </button>

          <button 
            onClick={triggerStressTest}
            disabled={isTriggering || !isConnected}
            className="bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-[10px] font-black uppercase tracking-wider px-5 py-2 rounded-lg transition-all disabled:opacity-40 shadow-md cursor-pointer flex items-center gap-1.5"
          >
            🔥 {isTriggering ? 'Executing Burst...' : `Trigger ${numWorkers}x Concurrency Burst`}
          </button>
        </div>
      </div>

      {/* CONCURRENCY CONFIGURATION TOOLBAR */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 text-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
          
          {/* Worker Count Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400 uppercase font-black">Goroutine Workers:</label>
            <select
              value={numWorkers}
              onChange={(e) => setNumWorkers(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-amber-400 text-xs font-black px-3 py-1.5 rounded-lg focus:outline-none focus:border-amber-500"
            >
              <option value={10}>10 Workers (Normal)</option>
              <option value={50}>50 Workers (Surge)</option>
              <option value={100}>100 Workers (Peak)</option>
              <option value={500}>500 Workers (Spike Test)</option>
              <option value={1000}>🔥 1,000 Workers (Max Chaos)</option>
            </select>
          </div>

          {/* Target Slot Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400 uppercase font-black">Target Slot ID:</label>
            <input
              type="number"
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              className="w-16 bg-slate-800 border border-slate-700 text-white text-xs font-black px-2.5 py-1.5 rounded-lg text-center focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Scenario Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400 uppercase font-black">Scenario:</label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-black px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500"
            >
              <option value="booking">🔒 Booking Engine Lock</option>
              <option value="split_payment">💳 Split Payment Share</option>
              <option value="matchmaking">🏆 Squad Matchmaking Join</option>
              <option value="cancellation">🗑️ Slot Release / Cancel</option>
            </select>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400 uppercase font-black">Test Mode:</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-black px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            >
              <option value="normal">Normal Load</option>
              <option value="peak">Peak Surge</option>
              <option value="spike">Spike Burst</option>
              <option value="chaos">Chaos Mode (Jitter)</option>
            </select>
          </div>
        </div>

        {/* Audit Status Badge */}
        {stats.oneBookingSuccessPassed ? (
          <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1.5">
            ✅ Lock Integrity Verified (1 Success Bound)
          </span>
        ) : (
          <span className="bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black uppercase px-3 py-1 rounded-full flex items-center gap-1.5">
            ⚠️ Double Booking Vulnerability Detected
          </span>
        )}
      </div>

      {/* KEY SYSTEM METRICS BAR */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-200">
        
        {/* Workers Scale */}
        <div className="bg-white p-4">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Workers Scale</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-xl font-black text-slate-900">{stats.totalRequests || numWorkers}</h3>
            <span className="text-[10px] text-slate-400 font-bold">goroutines</span>
          </div>
          <span className="text-[9px] font-bold text-slate-500 block mt-1">Scenario: {scenario}</span>
        </div>

        {/* Throughput (RPS) */}
        <div className="bg-white p-4">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Throughput (RPS)</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-xl font-black text-emerald-600">{stats.rps}</h3>
            <span className="text-[10px] text-slate-400 font-bold">req/sec</span>
          </div>
          <span className="text-[9px] font-bold text-emerald-600 block mt-1">✓ {stats.status200} OK</span>
        </div>

        {/* Row Lock Contention */}
        <div className="bg-white p-4">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Lock Contention</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-xl font-black text-rose-600">{stats.status409}</h3>
            <span className="text-[10px] text-slate-400 font-bold">blocked</span>
          </div>
          <span className="text-[9px] font-bold text-rose-500 block mt-1">409 Conflict Response</span>
        </div>

        {/* P50 Latency */}
        <div className="bg-white p-4">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">P50 Latency</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-xl font-black text-indigo-600">{stats.p50LatencyMs}</h3>
            <span className="text-[10px] text-slate-400 font-bold">ms</span>
          </div>
          <span className="text-[9px] font-bold text-indigo-400 block mt-1">Median response time</span>
        </div>

        {/* P95 Latency */}
        <div className="bg-white p-4">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">P95 Latency</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-xl font-black text-purple-600">{stats.p95LatencyMs}</h3>
            <span className="text-[10px] text-slate-400 font-bold">ms</span>
          </div>
          <span className="text-[9px] font-bold text-purple-400 block mt-1">95th percentile SLA</span>
        </div>

        {/* P99 Latency */}
        <div className="bg-white p-4">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">P99 Latency</span>
          <div className="flex items-baseline gap-1 mt-1">
            <h3 className="text-xl font-black text-amber-600">{stats.p99LatencyMs}</h3>
            <span className="text-[10px] text-slate-400 font-bold">ms</span>
          </div>
          <span className="text-[9px] font-bold text-amber-500 block mt-1">Max tail latency</span>
        </div>
      </div>

      {/* LIVE GRAPH + EVENT LOG */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-px bg-slate-200">
        
        {/* Live Graph (3/5 width) */}
        <div className="lg:col-span-3 bg-white p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
                P50, P95 & P99 Latency Telemetry Graph
              </h3>
              <p className="text-[9px] text-slate-500 font-semibold mt-0.5">Real-time percentile tracking across concurrent worker bursts</p>
            </div>
            <div className="flex gap-3 text-[9px] font-black uppercase tracking-wider">
              <span className="flex items-center gap-1 text-indigo-600"><span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block"></span> P50</span>
              <span className="flex items-center gap-1 text-purple-600"><span className="w-1.5 h-1.5 rounded-full bg-purple-600 inline-block"></span> P95</span>
              <span className="flex items-center gap-1 text-amber-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span> P99</span>
            </div>
          </div>
          
          <div className="h-60 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="p95Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} tickMargin={8} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickFormatter={(val) => `${val}ms`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #334155', 
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: '#fff'
                    }}
                  />
                  <Area type="monotone" dataKey="p50" stroke="#6366f1" strokeWidth={2} fill="url(#p50Grad)" name="P50 Latency (ms)" />
                  <Area type="monotone" dataKey="p95" stroke="#a855f7" strokeWidth={2} fill="url(#p95Grad)" name="P95 Latency (ms)" />
                  <Area type="monotone" dataKey="p99" stroke="#f59e0b" strokeWidth={2} fill="none" name="P99 Latency (ms)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-slate-400">
                <svg className="w-10 h-10 mb-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Awaiting Concurrency Telemetry</span>
                <span className="text-[9px] font-semibold mt-1 text-slate-400">Trigger a stress test to populate P50/P95/P99 curves</span>
              </div>
            )}
          </div>
        </div>

        {/* Real-Time Event Log (2/5 width) */}
        <div className="lg:col-span-2 bg-slate-50 p-5 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              Live Terminal Stream
            </h3>
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">{eventLogs.length} events</span>
          </div>

          <div className="flex-1 bg-[#0a0e17] border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-inner">
            <div className="bg-slate-900 border-b border-slate-800 px-3 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[8px] text-slate-400 font-bold ml-2 uppercase tracking-wider">concurrency://stdout</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] leading-relaxed max-h-56">
              {eventLogs.length === 0 ? (
                <div className="text-slate-500 flex items-center gap-2">
                  <span className="text-emerald-500">$</span> Ready for concurrency execution...
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
    </div>
  );
}
