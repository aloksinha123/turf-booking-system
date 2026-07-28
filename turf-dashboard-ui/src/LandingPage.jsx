import React, { useState, useCallback } from 'react';
import PriceBreakdownModal from './PriceBreakdownModal';
import { useWebSocket } from './useWebSocket';
import ToastContainer from './ToastContainer';

export default function LandingPage({
  slots,
  initiateBooking,
  joinWaitlist,
  isProcessingId,
  selectedDate,
  setSelectedDate,
  selectedTurf,
  setSelectedTurf,
  activeTab,
  setActiveTab,
  modifiers,
  user,
  token,
  handleLogout,
  resetSystem,
  BookingHistory,
  Matchmaking,
  API_BASE,
  downloadTicketPDF,
  triggerAlert
}) {
  const [viewMode, setViewMode] = useState('map'); // 'grid' | 'map'
  const [hoveredTurf, setHoveredTurf] = useState(null);
  const [mainNavTab, setMainNavTab] = useState('booking'); // 'booking' | 'matchmaking' | 'history'
  const [breakdownModalSlot, setBreakdownModalSlot] = useState(null);
  const [maintStatus, setMaintStatus] = useState({ is_maintenance: false, reason: '' });

  React.useEffect(() => {
    fetch(`${API_BASE}/api/v1/system/status`)
      .then(res => res.json())
      .then(data => setMaintStatus(data))
      .catch(() => {});
  }, [API_BASE]);

  const wsUrl = `ws://localhost:8085/ws`;
  const { status: wsStatus, onlineCount, toasts, removeToast } = useWebSocket({
    wsUrl,
    token,
  });

  // Helper to check availability per turf
  // Turf A = ID 1 (Football), Turf B = ID 2 (Cricket), Turf C = ID 3 (Badminton)
  const getTurfStatus = (turfId) => {
    // If database reset, all might be empty.
    const turfSlots = slots.filter(s => s.turf_id === turfId);
    if (turfSlots.length === 0) return 'available'; // Default to available for demonstration
    const hasAvailable = turfSlots.some(s => !s.is_booked && !s.is_locked);
    return hasAvailable ? 'available' : 'booked';
  };

  const handleTurfSelect = (id) => {
    setSelectedTurf(String(id));
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-white relative overflow-hidden font-sans">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Premium Gradient Background Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-emerald-500/10 to-indigo-500/0 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gradient-to-br from-purple-500/10 to-orange-500/0 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Cyberpunk Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>

      {/* Maintenance Mode Active Banner */}
      {maintStatus.is_maintenance && (
        <div className="bg-rose-600 text-white text-center py-2.5 px-4 font-black text-xs uppercase tracking-widest border-b border-rose-500 shadow-xl flex items-center justify-center gap-2 z-50 relative">
          <span className="animate-ping w-2 h-2 rounded-full bg-white"></span>
          🚫 System Maintenance Active: {maintStatus.reason || "Slot bookings are temporarily paused."}
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 sticky top-0 z-40 bg-[#0b0f19]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-[#0b0f19] shadow-[0_0_20px_rgba(16,185,129,0.3)] border-2 border-emerald-400 text-lg uppercase tracking-tight">
              {user?.name ? user.name.substring(0, 2) : 'PL'}
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
                {user?.name || 'Player'}
                <span className="bg-gradient-to-r from-orange-500 to-rose-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">PREMIUM</span>
              </h1>
              <p className="text-xs text-slate-400 font-bold flex items-center gap-2 mt-0.5">
                <span>🏏 Active Player</span>
                <span className="text-emerald-400 font-extrabold ml-1 bg-emerald-500/10 px-2 py-0.5 rounded">₹4,500.00 Wallet</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Real-time WS Status Pill */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300">
              {wsStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-emerald-400">🟢 Live</span>
                  <span className="text-slate-600">|</span>
                  <span>👥 {onlineCount} Online</span>
                </>
              ) : wsStatus === 'reconnecting' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                  <span className="text-amber-300">🟡 Connecting...</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span className="text-rose-400">🔴 Polling Fallback</span>
                </>
              )}
            </div>

            <button 
              onClick={() => setMainNavTab('booking')}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer border ${
                mainNavTab === 'booking'
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              🏟️ Book Turf
            </button>
            <button 
              onClick={() => setMainNavTab('matchmaking')}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer border ${
                mainNavTab === 'matchmaking'
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              ⚽ Public Matches
            </button>
            <button 
              onClick={() => setMainNavTab('history')}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer border ${
                mainNavTab === 'history'
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              📋 My Bookings
            </button>
            <button 
              onClick={handleLogout}
              className="bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-sm cursor-pointer ml-2"
            >
              Log Out
            </button>
            <button 
              onClick={resetSystem} 
              className="bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-400 font-bold px-4 py-2.5 rounded-xl text-xs transition-all active:scale-95 cursor-pointer"
            >
              Reset Database
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {mainNavTab === 'history' ? (
        <BookingHistory apiBase={API_BASE} token={token || localStorage.getItem('token')} downloadTicketPDF={downloadTicketPDF} triggerAlert={triggerAlert} /> 
      ) : mainNavTab === 'matchmaking' && Matchmaking ? (
        <Matchmaking apiBase={API_BASE} token={token || localStorage.getItem('token')} user={user} triggerAlert={triggerAlert} />
      ) : (
      <>
      {/* Hero Section */}
      <section className="relative pt-12 pb-16 px-6 max-w-7xl mx-auto text-center">
        {/* Floating status tag */}
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-indigo-500/30 px-4 py-2 rounded-full text-xs font-black tracking-wide uppercase text-indigo-200 mb-6 shadow-lg shadow-indigo-500/5 backdrop-blur-md animate-pulse">
          ⚡ 30% Flash Sale Active on Night Slots!
        </div>

        <h1 className="text-4xl md:text-7xl font-black tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-300 max-w-4xl mx-auto">
          BOOK YOUR ARENA.<br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">CLAIM THE PITCH.</span>
        </h1>
        <p className="text-slate-400 mt-6 max-w-xl mx-auto text-sm md:text-base font-semibold leading-relaxed">
          Experience dynamic real-time pricing and matchmaking at India's premium sports arenas. Lock your slot, invite friends, split the cost.
        </p>

        {/* Quick Search Floating Bar */}
        <div className="mt-12 bg-slate-900/80 border border-slate-800/80 p-4 rounded-3xl max-w-4xl mx-auto shadow-2xl backdrop-blur-2xl grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="flex flex-col items-start px-4 border-r border-slate-800/80">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-1">Select Arena / Sport</span>
            <select
              value={selectedTurf}
              onChange={(e) => handleTurfSelect(e.target.value)}
              className="bg-transparent border-none text-white font-bold text-sm w-full outline-none focus:ring-0 cursor-pointer"
            >
              <option value="1" className="bg-[#0b0f19]">Turf A (Football) - Bovox Arena</option>
              <option value="2" className="bg-[#0b0f19]">Turf B (Cricket) - Godrej Sky Turf</option>
              <option value="3" className="bg-[#0b0f19]">Turf C (Badminton) - Neon Court</option>
            </select>
          </div>

          <div className="flex flex-col items-start px-4 border-r border-slate-800/80">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-1">Booking Date</span>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-white font-bold text-sm w-full outline-none focus:ring-0 cursor-pointer"
              min={new Date().toISOString().split('T')[0]} 
            />
          </div>

          <div className="flex flex-col items-start px-4">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-1">Play Mode</span>
            <div className="flex w-full bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('premium')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'premium' ? 'bg-emerald-500 text-[#0b0f19]' : 'text-slate-400 hover:text-white'}`}
              >
                Standard Play
              </button>
              <button
                onClick={() => setActiveTab('matchmaking')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex justify-center items-center gap-1 ${activeTab === 'matchmaking' ? 'bg-emerald-500 text-[#0b0f19]' : 'text-slate-400 hover:text-white'}`}
              >
                Join Match 🏏
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        {/* Section Header with View Switcher */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-800/60 pb-5">
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight flex items-center gap-2">
              <span className="text-emerald-400">🏟️</span> Arena Live Status
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-semibold">Select an arena from the visual field map or grid layout</p>
          </div>

          {/* Toggle Switcher */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800 shadow-inner">
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'map' ? 'bg-emerald-500 text-[#0b0f19] shadow-md shadow-emerald-500/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🏟️ Visual Field Map
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-emerald-500 text-[#0b0f19] shadow-md shadow-emerald-500/10' : 'text-slate-400 hover:text-slate-200'}`}
            >
              📊 Grid View
            </button>
          </div>
        </div>

        {/* 🏟️ Visual Field Map Mode */}
        {viewMode === 'map' && (
          <div className="bg-slate-900/30 border border-slate-800/60 p-8 rounded-3xl backdrop-blur-sm relative overflow-hidden mb-12 shadow-2xl">
            {/* Legend / Info bar */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#ef4444] animate-pulse"></span> Fully Booked</span>
              </div>
              {hoveredTurf && (
                <div className="text-xs bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 font-extrabold text-slate-300">
                  Hovering: <span className="text-emerald-400 font-black">{hoveredTurf}</span>
                </div>
              )}
            </div>

            {/* Live Interactive SVG Field Layout */}
            <div className="relative w-full max-w-4xl mx-auto bg-slate-950/80 rounded-3xl border border-slate-800 p-4 shadow-inner">
              <svg viewBox="0 0 800 380" className="w-full h-auto">
                {/* Outlines of Sports Complex */}
                <rect x="10" y="10" width="780" height="360" rx="20" fill="none" stroke="#1e293b" strokeWidth="2" strokeDasharray="5 5" />
                <text x="30" y="35" className="fill-slate-600 text-[10px] font-black uppercase tracking-widest">BOVOX ARENA COMPLEX LAYOUT</text>

                {/* ⚽ Turf A: Football Field */}
                <g 
                  onClick={() => handleTurfSelect(1)}
                  onMouseEnter={() => setHoveredTurf('Turf A (Football)')}
                  onMouseLeave={() => setHoveredTurf(null)}
                  className="cursor-pointer group"
                >
                  {/* Glowing Outline */}
                  <rect 
                    x="40" y="60" width="220" height="150" rx="12" 
                    fill="#0f1f1a" 
                    stroke={selectedTurf === '1' ? '#10b981' : '#1f2937'} 
                    strokeWidth={selectedTurf === '1' ? '3' : '1.5'} 
                    className={`transition-all duration-300 ${getTurfStatus(1) === 'available' ? 'group-hover:stroke-emerald-400' : 'group-hover:stroke-rose-400'}`}
                  />
                  {/* Outer glow ring for availability */}
                  <rect 
                    x="37" y="57" width="226" height="156" rx="15" 
                    fill="none" 
                    stroke={getTurfStatus(1) === 'available' ? '#10b981' : '#ef4444'} 
                    strokeWidth="2" 
                    className={`opacity-40 transition-opacity ${getTurfStatus(1) === 'available' ? '' : 'animate-pulse'}`}
                  />

                  {/* SVG Football Markings */}
                  <rect x="50" y="70" width="200" height="130" fill="none" stroke="#2e7d32" strokeWidth="1" opacity="0.6" />
                  <line x1="150" y1="70" x2="150" y2="200" stroke="#2e7d32" strokeWidth="1" opacity="0.6" />
                  <circle cx="150" cy="135" r="25" fill="none" stroke="#2e7d32" strokeWidth="1" opacity="0.6" />
                  <rect x="50" y="105" width="25" height="60" fill="none" stroke="#2e7d32" strokeWidth="1" opacity="0.6" />
                  <rect x="225" y="105" width="25" height="60" fill="none" stroke="#2e7d32" strokeWidth="1" opacity="0.6" />

                  {/* Title and Badge */}
                  <text x="150" y="235" textAnchor="middle" className={`text-xs font-black uppercase tracking-wider fill-white ${selectedTurf === '1' ? 'fill-emerald-400' : ''}`}>TURF A (FOOTBALL)</text>
                  <text x="150" y="250" textAnchor="middle" className="text-[9px] fill-slate-500 font-bold">11v11 Professional Size</text>
                  
                  {/* Floating Availability Tag */}
                  <g transform="translate(110, 125)">
                    <rect x="0" y="0" width="80" height="20" rx="6" fill={getTurfStatus(1) === 'available' ? '#10b981' : '#ef4444'} />
                    <text x="40" y="13" textAnchor="middle" className="text-[9px] font-black fill-[#0b0f19] uppercase tracking-wider">
                      {getTurfStatus(1) === 'available' ? 'Available' : 'Booked'}
                    </text>
                  </g>
                </g>

                {/* 🏏 Turf B: Cricket Ground */}
                <g 
                  onClick={() => handleTurfSelect(2)}
                  onMouseEnter={() => setHoveredTurf('Turf B (Cricket)')}
                  onMouseLeave={() => setHoveredTurf(null)}
                  className="cursor-pointer group"
                >
                  {/* Glowing Outline */}
                  <rect 
                    x="290" y="60" width="220" height="150" rx="12" 
                    fill="#1e1b15" 
                    stroke={selectedTurf === '2' ? '#10b981' : '#1f2937'} 
                    strokeWidth={selectedTurf === '2' ? '3' : '1.5'} 
                    className="transition-all duration-300 group-hover:stroke-emerald-400"
                  />
                  <rect 
                    x="287" y="57" width="226" height="156" rx="15" 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="2" 
                    className="opacity-40"
                  />

                  {/* SVG Cricket Markings */}
                  <ellipse cx="400" cy="135" rx="90" ry="60" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
                  {/* Pitch in Center */}
                  <rect x="385" y="120" width="30" height="30" fill="#3f2f1f" rx="2" opacity="0.8" />
                  <line x1="390" y1="120" x2="390" y2="150" stroke="#f59e0b" strokeWidth="1" opacity="0.8" />
                  <line x1="410" y1="120" x2="410" y2="150" stroke="#f59e0b" strokeWidth="1" opacity="0.8" />

                  {/* Title and Badge */}
                  <text x="400" y="235" textAnchor="middle" className={`text-xs font-black uppercase tracking-wider fill-white ${selectedTurf === '2' ? 'fill-emerald-400' : ''}`}>TURF B (CRICKET)</text>
                  <text x="400" y="250" textAnchor="middle" className="text-[9px] fill-slate-500 font-bold">8-Over Box Pitch</text>

                  {/* Floating Promo Tag */}
                  <g transform="translate(350, 125)">
                    <rect x="0" y="0" width="100" height="20" rx="6" fill="#f59e0b" />
                    <text x="50" y="13" textAnchor="middle" className="text-[9px] font-black fill-[#0b0f19] uppercase tracking-wider">⚡ 30% OFF NIGHTS</text>
                  </g>
                </g>

                {/* 🏸 Turf C: Badminton Court */}
                <g 
                  onClick={() => handleTurfSelect(3)}
                  onMouseEnter={() => setHoveredTurf('Turf C (Badminton)')}
                  onMouseLeave={() => setHoveredTurf(null)}
                  className="cursor-pointer group"
                >
                  {/* Glowing Outline */}
                  <rect 
                    x="540" y="60" width="220" height="150" rx="12" 
                    fill="#0f172a" 
                    stroke={selectedTurf === '3' ? '#10b981' : '#1f2937'} 
                    strokeWidth={selectedTurf === '3' ? '3' : '1.5'} 
                    className="transition-all duration-300 group-hover:stroke-emerald-400"
                  />
                  <rect 
                    x="537" y="57" width="226" height="156" rx="15" 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="2" 
                    className="opacity-40"
                  />

                  {/* SVG Badminton Layout */}
                  <rect x="560" y="75" width="180" height="120" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.6" />
                  {/* Court markings */}
                  <line x1="650" y1="75" x2="650" y2="195" stroke="#3b82f6" strokeWidth="1.5" opacity="0.6" />
                  <line x1="560" y1="135" x2="740" y2="135" stroke="#3b82f6" strokeWidth="1" opacity="0.6" />
                  <line x1="580" y1="75" x2="580" y2="195" stroke="#3b82f6" strokeWidth="1" opacity="0.5" />
                  <line x1="720" y1="75" x2="720" y2="195" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5" />

                  {/* Title and Badge */}
                  <text x="650" y="235" textAnchor="middle" className={`text-xs font-black uppercase tracking-wider fill-white ${selectedTurf === '3' ? 'fill-emerald-400' : ''}`}>TURF C (BADMINTON)</text>
                  <text x="650" y="250" textAnchor="middle" className="text-[9px] fill-slate-500 font-bold">Standard Indoor Court</text>

                  {/* Floating Low Slots Tag */}
                  <g transform="translate(600, 125)">
                    <rect x="0" y="0" width="100" height="20" rx="6" fill="#a855f7" />
                    <text x="50" y="13" textAnchor="middle" className="text-[9px] font-black fill-[#0b0f19] uppercase tracking-wider">🔥 3 SLOTS LEFT</text>
                  </g>
                </g>
              </svg>
            </div>
            
            <div className="text-center mt-6">
              <p className="text-xs text-slate-400 font-bold bg-[#0b0f19] px-6 py-3.5 rounded-2xl border border-slate-800 w-fit mx-auto shadow-inner">
                💡 <span className="text-emerald-400">Click on any Turf layout above</span> to load its booking slots table instantly!
              </p>
            </div>
          </div>
        )}

        {/* 📊 Grid View Mode */}
        {viewMode === 'grid' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Turf Card A */}
            <div 
              onClick={() => handleTurfSelect(1)}
              className={`p-6 rounded-3xl border transition-all cursor-pointer ${selectedTurf === '1' ? 'bg-[#0f1f1a] border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded font-black tracking-wider uppercase">Active Arena</span>
                <span className={`w-3 h-3 rounded-full ${getTurfStatus(1) === 'available' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#ef4444]'}`}></span>
              </div>
              <h3 className="text-lg font-black tracking-tight">Turf A (Football)</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">Bovox Arena Complex, Mumbai</p>
              <p className="text-xs text-emerald-400 font-bold mt-4 flex items-center gap-1.5">
                ⚽ Professional AstroTurf Layout
              </p>
            </div>

            {/* Turf Card B */}
            <div 
              onClick={() => handleTurfSelect(2)}
              className={`p-6 rounded-3xl border transition-all cursor-pointer ${selectedTurf === '2' ? 'bg-[#1e1b15] border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-1 rounded font-black tracking-wider uppercase">Active Arena</span>
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
              </div>
              <h3 className="text-lg font-black tracking-tight">Turf B (Cricket)</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">Godrej Sky Turf, Mumbai</p>
              <p className="text-xs text-orange-400 font-bold mt-4 flex items-center gap-1.5">
                🏏 8-Over Box Pitch & Nets
              </p>
            </div>

            {/* Turf Card C */}
            <div 
              onClick={() => handleTurfSelect(3)}
              className={`p-6 rounded-3xl border transition-all cursor-pointer ${selectedTurf === '3' ? 'bg-[#1b1c29] border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.15)]' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded font-black tracking-wider uppercase">Active Arena</span>
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
              </div>
              <h3 className="text-lg font-black tracking-tight">Turf C (Badminton)</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">Indoor Premium Court, Mumbai</p>
              <p className="text-xs text-purple-400 font-bold mt-4 flex items-center gap-1.5">
                🏸 Double Wooden Court
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Pricing Engine status */}
        {modifiers && (
          <div className="mb-8 flex flex-wrap gap-4 items-center">
            <span className="text-xs font-black uppercase text-slate-500 tracking-widest">Dynamic Pricing Multipliers:</span>
            {modifiers.is_weekend && (
              <div className="bg-orange-500/15 border border-orange-500/30 text-orange-400 px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-2">
                🎉 Weekend Surge (1.3x)
              </div>
            )}
            {modifiers.is_raining && (
              <div className="bg-blue-500/15 border border-blue-500/30 text-blue-400 px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-2">
                🌧️ Monsoon Discount (0.7x)
              </div>
            )}
            {modifiers.global_multiplier !== 1.0 && (
              <div className="bg-slate-800 border border-slate-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-2">
                📈 Admin Adjuster ({modifiers.global_multiplier}x)
              </div>
            )}
          </div>
        )}

        {/* Slots Explorer Grid */}
        <div className="bg-slate-900/30 border border-slate-850/80 p-8 rounded-3xl shadow-2xl relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 border-b border-slate-800 pb-6">
            <div>
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                <span className="text-emerald-400">⚡</span> 
                {activeTab === 'premium' ? 'Available Standard Slots' : 'Join Public Matches'}
              </h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Showing slots for Turf {selectedTurf === '1' ? 'A' : selectedTurf === '2' ? 'B' : 'C'}
              </p>
            </div>
            
            {/* Dedicated Public Matches Tab Switcher */}
            <div className="flex bg-[#0b0f19] p-1.5 rounded-xl border border-slate-800 shadow-inner w-full md:w-auto">
              <button
                onClick={() => setActiveTab('premium')}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === 'premium' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}`}
              >
                Book Turf
              </button>
              <button
                onClick={() => setActiveTab('matchmaking')}
                className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'matchmaking' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900/50'}`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Public Matches
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {slots.filter(s => activeTab === 'premium' ? s.matchmaking_status !== 'open_for_players' : s.matchmaking_status === 'open_for_players').length === 0 ? (
              <div className="col-span-full text-center py-20 bg-slate-950/40 border border-dashed border-slate-800 rounded-3xl text-slate-500 font-bold text-sm shadow-inner">
                No slots found for this date. Generate daily slots in Admin dashboard!
              </div>
            ) : (
              slots.map((slot) => {
                const isSurge = slot.pricing_tag === 'SURGE';
                const isFlashSale = slot.pricing_tag === 'FLASH_SALE';
                const isPeak = isSurge; // Maintain variable for styling
                const isHeld = slot.hold_expires_at && new Date(slot.hold_expires_at) > new Date();

                return (
                  <div 
                    key={slot.id} 
                    className={`relative bg-[#0d1220]/80 border rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${
                      isHeld
                        ? 'border-yellow-500/50 shadow-[0_8px_30px_rgba(234,179,8,0.08)] hover:shadow-[0_12px_40px_rgba(234,179,8,0.18)] hover:border-yellow-400'
                        : isSurge 
                        ? 'border-purple-500/50 shadow-[0_8px_30px_rgba(168,85,247,0.08)] hover:shadow-[0_12px_40px_rgba(168,85,247,0.18)] hover:border-purple-400' 
                        : isFlashSale
                        ? 'border-blue-500/50 shadow-[0_8px_30px_rgba(59,130,246,0.08)] hover:shadow-[0_12px_40px_rgba(59,130,246,0.18)] hover:border-blue-400'
                        : 'border-slate-800 hover:border-slate-700 hover:bg-[#0f172a]'
                    }`}
                  >
                    {/* Dynamic Pricing Badges */}
                    {isSurge && (
                      <div className="absolute -top-3 right-4 bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white text-[9px] uppercase font-extrabold px-3 py-1 rounded-full tracking-wider animate-pulse flex items-center gap-1 shadow-md border border-purple-400/50">
                        ⚡ Peak Surge
                      </div>
                    )}
                    {isFlashSale && (
                      <div className="absolute -top-3 right-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[9px] uppercase font-extrabold px-3 py-1 rounded-full tracking-wider animate-pulse flex items-center gap-1 shadow-md border border-blue-400/50">
                        🌧️ Monsoon Discount
                      </div>
                    )}

                    <div className="mt-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Slot #{String(slot.id).padStart(3, '0')}</p>
                      <h3 className="text-3xl font-black text-white tracking-tight">{slot.start_time}</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-2 bg-slate-900 border border-slate-800/80 inline-block px-2.5 py-1 rounded-lg">60 mins</p>
                    </div>

                    <div className="mt-8 pt-5 border-t border-slate-800/80 flex items-end justify-between">
                      <div>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1 flex items-center gap-2">
                          {activeTab === 'matchmaking' ? 'Per Player' : 'Final price'}
                          {slot.original_price && slot.original_price !== slot.base_price && activeTab !== 'matchmaking' && (
                            <span className="line-through text-slate-600 text-xs">₹{slot.original_price}</span>
                          )}
                        </p>
                        <p className={`text-2xl font-black flex items-baseline gap-2 ${isPeak ? 'text-purple-400' : isFlashSale ? 'text-blue-400' : 'text-emerald-400'}`}>
                          ₹{activeTab === 'matchmaking' ? Math.round(slot.base_price / slot.required_players) : Math.round(slot.base_price)}
                        </p>
                        {activeTab === 'matchmaking' && (
                          <p className="text-[10px] text-indigo-400 font-extrabold mt-1.5 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block">
                            {slot.current_players}/{slot.required_players} Players
                          </p>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          if (isHeld) {
                            joinWaitlist(slot.id);
                          } else {
                            setBreakdownModalSlot(slot);
                          }
                        }}
                        disabled={isProcessingId === slot.id && !isHeld}
                        className={`text-xs font-black uppercase tracking-wider px-5 py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer ${
                          isHeld
                            ? 'bg-yellow-500 hover:bg-yellow-400 text-yellow-950 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                            : isPeak 
                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
                            : 'bg-emerald-500 hover:bg-emerald-400 text-[#0b0f19] font-black shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        }`}
                      >
                        {isProcessingId === slot.id && !isHeld ? 'Holding...' : isHeld ? '⏳ Join Waitlist' : (activeTab === 'matchmaking' ? 'Join Match' : 'Book Now')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
      </>
      )}

      {/* Price Breakdown Modal */}
      {breakdownModalSlot && (
        <PriceBreakdownModal
          slot={breakdownModalSlot}
          apiBase={API_BASE}
          onClose={() => setBreakdownModalSlot(null)}
          onProceedToCheckout={(selectedSlot, finalFare) => {
            initiateBooking(selectedSlot);
          }}
          triggerAlert={triggerAlert}
        />
      )}
    </div>
  );
}