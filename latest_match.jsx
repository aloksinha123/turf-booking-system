import React, { useState } from 'react';

// PriceTooltip: explains why the current price differs from base price
function PriceTooltip({ pricingTag, multiplier, globalMultiplier, isWeekend, isRaining }) {
  const reasons = [];
  if (pricingTag === 'SURGE') reasons.push({ label: 'Peak Hour (5 PM–10 PM)', value: '1.5×', color: 'text-orange-600' });
  if (isWeekend) reasons.push({ label: 'Weekend Surge', value: '1.3×', color: 'text-orange-600' });
  if (isRaining) reasons.push({ label: 'Monsoon Discount', value: '0.7×', color: 'text-blue-500' });
  if (pricingTag === 'FLASH_SALE') reasons.push({ label: 'Flash Sale (Low Demand)', value: '0.7×', color: 'text-emerald-600' });
  if (globalMultiplier && globalMultiplier !== 1.0) reasons.push({ label: 'Admin Adjuster', value: globalMultiplier + '×', color: 'text-purple-500' });
  if (reasons.length === 0) reasons.push({ label: 'Standard Rate', value: '1.0×', color: 'text-slate-500' });

  return (
    <div className="price-tooltip ml-2 cursor-help relative inline-flex items-center group">
      <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[8px] font-black hover:bg-slate-300 transition-colors">i</span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-xs rounded-xl p-3 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
        <p className="font-black text-emerald-400 uppercase tracking-wider text-[9px] mb-2">Pricing Details</p>
        <div className="space-y-1.5">
          {reasons.map((r, i) => (
            <div key={i} className="flex justify-between items-center text-[10px]">
              <span className="text-slate-300">{r.label}</span>
              <span className={"font-black " + r.color}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({
  slots, initiateBooking, isProcessingId, selectedDate, setSelectedDate,
  selectedTurf, setSelectedTurf, activeTab, setActiveTab, modifiers,
  user, handleLogout, resetSystem,
}) {
  const [viewMode, setViewMode] = useState('grid');
  
  // Fake calendar generation for UI purposes
  const generateCalendarDays = () => {
    const days = [];
    // Just a placeholder layout of a month
    const startOffset = 2; // Wednesday start for example
    for(let i=0; i<startOffset; i++) days.push(null);
    for(let i=1; i<=31; i++) days.push(i);
    return days;
  };
  const calendarDays = generateCalendarDays();
  
  // Extract selected day to highlight in calendar
  const selectedDayNum = parseInt(selectedDate.split('-')[2] || "25", 10);

  const getDynamicBadgeStyle = (slot) => {
    const isSurge = (slot.pricing_tag === 'SURGE' || modifiers?.is_weekend) && !modifiers?.is_raining;
    const isFlashSale = slot.pricing_tag === 'FLASH_SALE' || modifiers?.is_raining;
    const isMatchmakingSlot = slot.matchmaking_status === 'open_for_players';

    if (isSurge) return { type: 'surge', color: 'orange', label: 'High Demand', border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-500' };
    if (isFlashSale) return { type: 'flash', color: 'emerald', label: 'Flash Sale', border: 'border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500' };
    if (isMatchmakingSlot) return { type: 'match', color: 'indigo', label: 'Open Match', border: 'border-indigo-500', text: 'text-indigo-500', bg: 'bg-indigo-500' };
    
    return { type: 'standard', color: 'emerald', label: '', border: 'border-slate-200 hover:border-emerald-500', text: 'text-slate-900', bg: 'bg-[#15803d]' };
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-12">
      
      {/* 1. TOP NAVIGATION BAR */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-[#166534] rounded-full flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm-1-13h2v4h-2V7zm0 6h2v2h-2v-2z" /></svg>
              </div>
              <span className="text-xl font-black tracking-tight text-slate-900">Turf<span className="text-[#166534]">Book</span></span>
            </div>
            
            {/* Nav Links */}
            <nav className="hidden md:flex items-center h-16">
              <a href="#" className="h-full flex items-center px-4 border-b-2 border-[#166534] text-[#166534] font-bold text-sm bg-emerald-50">Home</a>
              <a href="#" className="h-full flex items-center px-4 border-b-2 border-transparent hover:border-slate-300 text-slate-900 font-bold text-sm hover:bg-slate-50 transition-colors">My Bookings</a>
              <a href="#" className="h-full flex items-center px-4 border-b-2 border-transparent hover:border-slate-300 text-slate-900 font-bold text-sm hover:bg-slate-50 transition-colors">Venues</a>
              <a href="#" className="h-full flex items-center px-4 border-b-2 border-transparent hover:border-slate-300 text-slate-900 font-bold text-sm hover:bg-slate-50 transition-colors">Offers</a>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Wallet Widget */}
            <div className="hidden sm:flex items-center gap-2 bg-emerald-50/50 border border-emerald-100 rounded-lg py-1.5 px-3">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
              <div>
                <p className="text-[10px] font-bold text-slate-500 leading-none">Wallet Balance</p>
                <p className="text-xs font-black text-slate-900 leading-none mt-0.5">₹4,500.00</p>
              </div>
            </div>

            {/* Notification */}
            <button className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors relative cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
            </button>

            {/* Profile Dropdown Trigger */}
            <div className="flex items-center gap-2 cursor-pointer border-l border-slate-200 pl-4" onClick={handleLogout}>
              <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                <img src="https://i.pravatar.cc/100?img=11" alt="User" className="w-full h-full object-cover" />
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-bold text-slate-900 leading-none">{user?.name || 'Player_8585'}</p>
                <p className="text-[9px] font-semibold text-slate-500 leading-none mt-1">Premium</p>
              </div>
              <svg className="w-3 h-3 text-slate-400 hidden lg:block ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>
        </div>
      </header>

      {/* 2. HERO BANNER */}
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="w-full rounded-3xl overflow-hidden relative bg-[#022c22] shadow-xl aspect-[21/9] md:aspect-[24/7]">
          {/* Turf Background Image */}
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1518605368461-1ee125225f27?q=80&w=1470&auto=format&fit=crop')", opacity: 0.65 }}></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#022c22]/90 to-transparent"></div>

          {/* Hero Content */}
          <div className="absolute inset-0 p-8 md:p-12 flex flex-col justify-between">
            <div>
              <p className="text-xs font-black tracking-widest text-[#34d399] uppercase mb-4">Play. Compete. Win.</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.1] tracking-tight">
                Book Your Turf.<br/>
                <span className="text-[#34d399]">Own The Game.</span>
              </h1>
              <p className="text-slate-300 mt-4 max-w-sm text-xs md:text-sm font-medium leading-relaxed hidden sm:block">
                Premium turfs. Best prices. Real-time availability. Gather your squad and hit the ground!
              </p>
            </div>

            {/* Bottom Info Badges */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-8">
              <div className="flex flex-wrap gap-3">
                <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg border border-emerald-500/30 flex items-center justify-center"><svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg></div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-wider">Trusted Venues</p>
                    <p className="text-[9px] text-slate-400">Verified & Premium</p>
                  </div>
                </div>
                <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-2.5 flex items-center gap-3 hidden sm:flex">
                  <div className="w-8 h-8 rounded-lg border border-emerald-500/30 flex items-center justify-center"><svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg></div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-wider">Squad Split</p>
                    <p className="text-[9px] text-slate-400">Easy Group Payments</p>
                  </div>
                </div>
                <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl p-2.5 flex items-center gap-3 hidden md:flex">
                  <div className="w-8 h-8 rounded-lg border border-emerald-500/30 flex items-center justify-center"><svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase tracking-wider">Instant Booking</p>
                    <p className="text-[9px] text-slate-400">Real-time Confirmation</p>
                  </div>
                </div>
              </div>

              {/* Rating Badge */}
              <div className="bg-[#0f241a]/80 backdrop-blur-md border border-[#15803d]/30 rounded-xl p-3 flex flex-col items-end shadow-lg ml-auto">
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-[#34d399]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  <span className="text-xl font-black text-white tracking-tight">4.8</span>
                </div>
                <p className="text-[9px] text-emerald-400/80 font-bold tracking-wider uppercase mt-1">1200+ Reviews</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MAIN TWO-COLUMN LAYOUT */}
      <div className="max-w-[1440px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 relative items-start">
        
        {/* LEFT COLUMN (Sidebar) */}
        <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-24">
          
          {/* Select Arena Box */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Select Arena
            </h3>
            
            <div className="border border-slate-200 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:border-[#166534] transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden shadow-sm relative">
                  <img src="https://images.unsplash.com/photo-1574629810360-7efbb1925828?w=200&h=200&fit=crop" alt="Arena" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-1">
                    Bovox Arena <svg className="w-3.5 h-3.5 text-[#10b981]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  </h4>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Andheri West, Mumbai</p>
                  <div className="mt-1.5 bg-emerald-50 border border-emerald-200 text-[#166534] text-[9px] font-bold px-1.5 py-0.5 rounded w-fit inline-flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                    3 Pitches
                  </div>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </div>
          </div>

          {/* Date Selector Box (Custom Calendar) */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                Select Date
              </h3>
            </div>
            
            <div className="border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-4">
                <button className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-100 text-slate-600"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
                <span className="text-xs font-black text-slate-900 tracking-wide">July 2026</span>
                <button className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-100 text-slate-600"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                  <div key={day} className="text-[8px] font-black text-slate-400 uppercase tracking-widest py-1">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {calendarDays.map((day, idx) => {
                  if(!day) return <div key={idx} className="w-7 h-7 mx-auto"></div>;
                  const isSelected = day === selectedDayNum;
                  return (
                    <div key={idx} className="w-7 h-7 mx-auto flex items-center justify-center cursor-pointer relative group" onClick={() => setSelectedDate(`2026-07-${String(day).padStart(2,'0')}`)}>
                      <span className={`text-[11px] font-bold z-10 ${isSelected ? 'text-white' : 'text-slate-700 group-hover:text-slate-900'}`}>{day}</span>
                      <div className={`absolute inset-0 rounded-full transition-colors ${isSelected ? 'bg-[#10b981] shadow-md shadow-[#10b981]/30' : 'bg-transparent group-hover:bg-slate-100'}`}></div>
                      {day % 5 === 0 && !isSelected && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400"></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Flash Sale Banner */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 shadow-sm border border-emerald-100 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl"></div>
            <h4 className="text-sm font-black text-emerald-800 tracking-tight flex items-center gap-1.5">
              Flash Sale Active! <span className="text-orange-500 animate-pulse">⚡</span>
            </h4>
            <p className="text-[10px] font-bold text-emerald-600/80 mt-0.5">30% OFF on afternoon slots</p>
            
            <div className="mt-4 bg-white/60 border border-emerald-200/60 rounded-xl p-2.5 flex items-center justify-center gap-3 backdrop-blur-sm shadow-sm">
              <div className="text-center">
                <span className="block text-sm font-black text-emerald-700 font-mono">02</span>
                <span className="block text-[7px] font-black uppercase tracking-wider text-emerald-500">HRS</span>
              </div>
              <span className="text-sm font-black text-emerald-700/50 -translate-y-1.5">:</span>
              <div className="text-center">
                <span className="block text-sm font-black text-emerald-700 font-mono">45</span>
                <span className="block text-[7px] font-black uppercase tracking-wider text-emerald-500">MIN</span>
              </div>
              <span className="text-sm font-black text-emerald-700/50 -translate-y-1.5">:</span>
              <div className="text-center">
                <span className="block text-sm font-black text-emerald-700 font-mono">30</span>
                <span className="block text-[7px] font-black uppercase tracking-wider text-emerald-500">SEC</span>
              </div>
            </div>
          </div>
          
        </div>

        {/* RIGHT COLUMN (Main Content) */}
        <div className="lg:col-span-9 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
          
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 pb-6 border-b border-slate-100 gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Available Slots</h2>
              
              {/* Pitch Selector Tabs */}
              <div className="flex items-center gap-6 mt-4">
                <button onClick={() => setSelectedTurf('1')} className={`relative pb-2 text-sm font-bold transition-colors ${selectedTurf === '1' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                  <span className="flex items-center gap-1.5"><span className="text-[#10b981]">⚽</span> Pitch A (Football)</span>
                  {selectedTurf === '1' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#10b981] rounded-t-full"></div>}
                </button>
                <button onClick={() => setSelectedTurf('2')} className={`relative pb-2 text-sm font-bold transition-colors ${selectedTurf === '2' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                  <span className="flex items-center gap-1.5"><span className="text-amber-500">🏏</span> Pitch B (Cricket)</span>
                  {selectedTurf === '2' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#10b981] rounded-t-full"></div>}
                </button>
              </div>
            </div>

            {/* View Toggles */}
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 self-end sm:self-auto shadow-inner">
              <button onClick={() => setViewMode('grid')} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[#166534] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                Grid View
              </button>
              <button onClick={() => setViewMode('list')} className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
                List View
              </button>
            </div>
          </div>

          {/* Slot Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {slots.length === 0 ? (
              <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                <span className="text-4xl mb-4 block">🏟️</span>
                <p className="text-slate-900 font-black text-lg">No slots available</p>
                <p className="text-slate-500 text-sm font-semibold mt-1">Please select another date or pitch.</p>
              </div>
            ) : (
              slots.filter(s => String(s.turf_id) === selectedTurf).map((slot) => {
                const style = getDynamicBadgeStyle(slot);
                const displayPrice = (slot.base_price * modifiers.multiplier).toFixed(0);
                const isBookedOrLocked = slot.is_booked || slot.is_locked;

                if (isBookedOrLocked) return null; // Only show available slots based on reference image UI

                return (
                  <div key={slot.id} className={`relative bg-white border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${style.border}`}>
                    
                    {/* Top corner badge if surge/flash/match */}
                    {style.label && (
                      <div className={`absolute -top-3 left-4 ${style.bg} text-white text-[9px] uppercase font-black tracking-wider px-3 py-1 rounded-full shadow-md`}>
                        {style.label}
                      </div>
                    )}
                    
                    {/* Time & Duration */}
                    <div className="flex justify-between items-center mt-1">
                      <h3 className="text-[13px] sm:text-[15px] font-black text-slate-900 tracking-tight">{slot.start_time} - {slot.end_time}</h3>
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md whitespace-nowrap">60 min</span>
                    </div>

                    {/* Price Area */}
                    <div className="mt-5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5 flex items-center">
                        Dynamic Price <PriceTooltip pricingTag={slot.pricing_tag} multiplier={modifiers?.multiplier} />
                      </p>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-2xl sm:text-3xl font-black tracking-tight ${style.type === 'surge' ? 'text-orange-500' : 'text-[#166534]'}`}>
                          ₹{displayPrice}
                        </span>
                        {modifiers.multiplier !== 1.0 && <span className="text-[10px] text-slate-400 font-bold line-through">₹{slot.base_price}</span>}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-6">
                      <button 
                        onClick={() => initiateBooking(slot)}
                        disabled={isProcessingId === slot.id}
                        className={`flex-1 ${style.type === 'surge' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#15803d] hover:bg-[#166534]'} text-white text-[10px] font-black uppercase tracking-wider py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 shadow-md cursor-pointer`}
                      >
                        {isProcessingId === slot.id ? '...' : 'Book Now'}
                      </button>
                      <button 
                        onClick={() => initiateBooking(slot)}
                        disabled={isProcessingId === slot.id}
                        className={`flex-1 bg-white border hover:bg-slate-50 text-[10px] font-black uppercase tracking-wider py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${style.type === 'surge' ? 'border-orange-500 text-orange-600' : 'border-slate-300 text-slate-700'}`}
                      >
                        Split & Share
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {/* Footer Trust Banners */}
          <div className="mt-12 pt-8 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
              <div>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Best Price Guarantee</p>
                <p className="text-[9px] font-semibold text-slate-500 mt-0.5">We offer the most competitive prices</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg></div>
              <div>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Easy Cancellations</p>
                <p className="text-[9px] font-semibold text-slate-500 mt-0.5">Cancel up to 2 hours before</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg></div>
              <div>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Secure Payments</p>
                <p className="text-[9px] font-semibold text-slate-500 mt-0.5">100% safe & encrypted</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 9v2m0 4h.01"/></svg></div>
              <div>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Customer Support</p>
                <p className="text-[9px] font-semibold text-slate-500 mt-0.5">24/7 dedicated support</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
