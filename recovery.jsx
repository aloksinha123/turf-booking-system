Created At: 2026-07-26T09:48:58Z
Completed At: 2026-07-26T09:49:28Z
The following changes were made by the multi_replace_file_content tool to: c:\Users\aloks\OneDrive\Desktop\turf-booking-system\turf-dashboard-ui\src\LandingPage.jsx. If relevant, proactively run terminal commands to execute this code for the USER. Don't ask for permission.
[diff_block_start]
@@ -35,10 +35,11 @@
 export default function LandingPage({
   slots, initiateBooking, isProcessingId, selectedDate, setSelectedDate,
   selectedTurf, setSelectedTurf, activeTab, setActiveTab, modifiers,
-  user, handleLogout, resetSystem,
+  user, handleLogout, resetSystem, BookingHistory, API_BASE,
 }) {
   const [viewMode, setViewMode] = useState('map');
   const [hoveredTurf, setHoveredTurf] = useState(null);
+  const [showHistory, setShowHistory] = useState(false);
 
   const TURFS = [
     { id: 1, badge: '⚽ Pitch A (7v7 Football)', venue: 'Bovox Arena Complex', colorClass: 'border-emerald-500 shadow-emerald-500/20 text-emerald-400 bg-emerald-950/20', hoverBorder: 'hover:border-emerald-400', selectedClass: 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)] bg-slate-900/60' },
@@ -97,7 +97,10 @@
           </div>
 
           <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-end mt-2 sm:mt-0 flex-shrink-0">
-            <button onClick={handleLogout} id="logout-btn" className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm">Log Out</button>
+            <button onClick={() => setShowHistory(!showHistory)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black uppercase tracking-wider rounded-lg border border-slate-200 transition-all shadow-sm">
+              {showHistory ? "Back to Booking" : "My Bookings"}
+            </button>
+            <button onClick={handleLogout} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black uppercase tracking-wider rounded-lg border border-slate-700 transition-all shadow-lg shadow-slate-900/20">Log Out</button>
             <button onClick={resetSystem} id="reset-db-btn" className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm">Reset DB</button>
           </div>
         </div>
@@ -104,276 +104,4 @@
 
-      {/* HERO SECTION */}
-      <section className="relative pt-24 pb-24 px-6 mb-8 text-center overflow-hidden">
-        {/* Background Image & Overlay */}
-        <div 
-          className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0" 
-          style={{ backgroundImage: "url('/turf-image.png')" }}
-        ></div>
-        <div className="absolute inset-0 bg-slate-900/80 z-0"></div>
-
-        <div className="relative z-10 max-w-7xl mx-auto">
-          {/* Floating premium alert */}
-          <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 px-4 py-2 rounded-full text-xs font-black tracking-wide uppercase mb-8 shadow-sm animate-badge-float backdrop-blur-sm">
-            <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse"></span>
-            ⚡ 30% Flash Sale Active for Afternoon Slots
-          </div>
-
-          <h1 className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tight leading-none text-white max-w-5xl mx-auto uppercase drop-shadow-lg">
-            Book Your Arena.<br />
-            <span className={"bg-clip-text text-transparent bg-gradient-to-r " + getSelectedHeadingColor()}>Claim The Pitch.</span>
-          </h1>
-          <p className="text-slate-300 mt-5 max-w-lg mx-auto text-sm font-semibold leading-relaxed drop-shadow-md">
-            Experience real-time pricing and smooth squad split payments on India's most advanced sports platform.
-          </p>
-        </div>
-      </section>
-
-      <section className="relative px-6 max-w-7xl mx-auto text-center -mt-16 z-20">
-        {/* Quick Search Bar */}
-        <div className="mt-12 bg-white/90 border border-slate-200 p-3 rounded-3xl max-w-4xl mx-auto shadow-xl backdrop-blur-md grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-0 items-center divide-y md:divide-y-0 md:divide-x divide-slate-200 text-left">
-          <div className="flex flex-col items-start px-5 py-2">
-            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-1">Select Arena</span>
-            <select value={selectedTurf} onChange={(e) => handleTurfSelect(e.target.value)} className="bg-transparent border-none text-slate-900 font-bold text-sm w-full outline-none cursor-pointer">
-              <option value="1" className="bg-white">⚽ Turf A (Football) — Bovox Arena</option>
-              <option value="2" className="bg-white">🏏 Turf B (Cricket) — Godrej Sky Turf</option>
-              <option value="3" className="bg-white">🏸 Turf C (Badminton) — Neon Court</option>
-            </select>
-          </div>
-          <div className="flex flex-col items-start px-5 py-2">
-            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-1">Booking Date</span>
-            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none text-slate-900 font-bold text-sm w-full outline-none cursor-pointer" min={new Date().toISOString().split('T')[0]} />
-          </div>
-          <div className="flex flex-col items-start px-5 py-2">
-            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider mb-1">Play Mode</span>
-            <div className="flex w-full bg-slate-100 p-1 rounded-xl border border-slate-200">
-              <button onClick={() => setActiveTab('premium')} className={"flex-1 py-1.5 text-xs font-bold rounded-lg transition-all " + (activeTab === 'premium' ? 'bg-[#10b981] text-white shadow' : 'text-slate-500 hover:text-slate-700')}>Standard Play</button>
-              <button onClick={() => setActiveTab('matchmaking')} className={"flex-1 py-1.5 text-xs font-bold rounded-lg transition-all " + (activeTab === 'matchmaking' ? 'bg-[#10b981] text-white shadow' : 'text-slate-500 hover:text-slate-700')}>Join Match 🏅</button>
-            </div>
-          </div>
-        </div>
-      </section>
-
-      {/* MAIN LAYOUT */}
-      <section className="max-w-7xl mx-auto px-6 pb-24">
-        {/* View mode switcher */}
-        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-slate-200 pb-5 gap-4">
-          <div>
-            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
-              <span className={selectedTurf === '1' ? 'text-emerald-500' : selectedTurf === '2' ? 'text-amber-500' : 'text-indigo-500'}>🏟️</span> Arena Live Status
-            </h2>
-            <p className="text-xs text-slate-500 mt-1 font-semibold">Select a pitch to see slot availability and pricing details</p>
-          </div>
-          <div className="flex w-full sm:w-auto bg-slate-100 border border-slate-200 p-1 rounded-xl shadow-inner overflow-hidden">
-            <button onClick={() => setViewMode('map')} className={"flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all " + (viewMode === 'map' ? 'bg-[#10b981] text-white shadow' : 'text-slate-500 hover:text-slate-700')}>🏟️ Visual Field Map</button>
-            <button onClick={() => setViewMode('grid')} className={"flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all " + (viewMode === 'grid' ? 'bg-[#10b981] text-white shadow' : 'text-slate-500 hover:text-slate-700')}>📊 Grid View</button>
-          </div>
-        </div>
-
-        {/* VISUAL FIELD MAP */}
-        {viewMode === 'map' && (
-          <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-xl mb-10 relative overflow-hidden backdrop-blur-md">
-            <div className={"absolute top-0 left-0 right-0 h-1 bg-gradient-to-r " + getSelectedHeadingColor() + " rounded-t-3xl"}></div>
-
-            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
-              <div className="flex gap-4 text-xs font-bold text-slate-500">
-                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981] animate-pulse"></span> Available</span>
-                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse"></span> Booked</span>
-              </div>
-              {hoveredTurf && (
-                <div className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-600 self-end sm:self-auto">
-                  {hoveredTurf}
-                </div>
-              )}
-            </div>
-
-            <div className="relative w-full max-w-4xl mx-auto bg-slate-50 rounded-2xl border border-slate-200 p-4 shadow-inner grass-bg overflow-x-auto">
-              <svg viewBox="0 0 820 290" className="w-[800px] md:w-full h-auto">
-                <rect x="10" y="10" width="800" height="270" rx="18" fill="none" stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="6 4"/>
-                <text x="35" y="32" fill="#475569" fontSize="9" fontWeight="800" fontFamily="Inter,sans-serif" letterSpacing="3">BOVOX SPORTS COMPLEX — INTERACTIVE ARENA MAP</text>
-
-                {/* TURF A: Football */}
-                <g onClick={() => handleTurfSelect(1)} onMouseEnter={() => setHoveredTurf('⚽ Turf A — Football (7v7)')} onMouseLeave={() => setHoveredTurf(null)} style={{cursor:'pointer'}}>
-                  {getTurfStatus(1) === 'available' ? (
-                    <rect x="33" y="45" width="234" height="158" rx="14" fill="none" stroke="#10b981" strokeWidth="2.5" className="animate-glow-green" />
-                  ) : (
-                    <rect x="33" y="45" width="234" height="158" rx="14" fill="none" stroke="#ef4444" strokeWidth="2.5" className="animate-pulse" />
-                  )}
-                  <rect x="38" y="50" width="224" height="148" rx="11" fill={getTurfStatus(1) === 'booked' ? '#271c1c' : '#0a1d17'} stroke={selectedTurf === '1' ? '#10b981' : (getTurfStatus(1) === 'booked' ? '#ef4444' : '#065f46')} strokeWidth={selectedTurf === '1' ? '2.5' : '1.5'}/>
-                  <rect x="52" y="62" width="196" height="122" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.35"/>
-                  <line x1="150" y1="62" x2="150" y2="184" stroke="#10b981" strokeWidth="1" opacity="0.35"/>
-                  <circle cx="150" cy="123" r="26" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.35"/>
-                  <circle cx="150" cy="123" r="3" fill="#10b981" opacity="0.5"/>
-                  <rect x="52" y="97" width="25" height="52" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.4"/>
-                  <rect x="223" y="97" width="25" height="52" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.4"/>
-                  <rect x="108" y="111" width="84" height="22" rx="7" fill={getTurfStatus(1) === 'available' ? '#10b981' : '#ef4444'}/>
-                  <text x="150" y="125" textAnchor="middle" fill={getTurfStatus(1) === 'available' ? '#0b0f19' : 'white'} fontSize="9" fontWeight="800" fontFamily="Inter,sans-serif">{getTurfStatus(1) === 'available' ? '✓ AVAILABLE' : '✗ BOOKED'}</text>
-                  <text x="150" y="218" textAnchor="middle" fill={selectedTurf === '1' ? '#34d399' : '#94a3b8'} fontSize="10" fontWeight="900" fontFamily="Inter,sans-serif">⚽ TURF A (FOOTBALL)</text>
-                  <text x="150" y="232" textAnchor="middle" fill="#64748b" fontSize="8.5" fontFamily="Inter,sans-serif">7v7 Professional AstroTurf</text>
-                  {selectedTurf === '1' && <rect x="34" y="46" width="232" height="156" rx="14" fill="none" stroke="#10b981" strokeWidth="2.5" opacity="0.6"/>}
-                </g>
-
-                {/* TURF B: Cricket */}
-                <g onClick={() => handleTurfSelect(2)} onMouseEnter={() => setHoveredTurf('🏏 Turf B — Box Cricket')} onMouseLeave={() => setHoveredTurf(null)} style={{cursor:'pointer'}}>
-                  {getTurfStatus(2) === 'available' ? (
-                    <rect x="293" y="45" width="234" height="158" rx="14" fill="none" stroke="#10b981" strokeWidth="2.5" className="animate-glow-green" />
-                  ) : (
-                    <rect x="293" y="45" width="234" height="158" rx="14" fill="none" stroke="#ef4444" strokeWidth="2.5" className="animate-pulse" />
-                  )}
-                  <rect x="298" y="50" width="224" height="148" rx="11" fill={getTurfStatus(2) === 'booked' ? '#271c1c' : '#221603'} stroke={selectedTurf === '2' ? '#10b981' : (getTurfStatus(2) === 'booked' ? '#ef4444' : '#854d0e')} strokeWidth={selectedTurf === '2' ? '2.5' : '1.5'}/>
-                  <ellipse cx="410" cy="124" rx="90" ry="58" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5"/>
-                  <rect x="395" y="108" width="30" height="32" fill="#451a03" rx="3"/>
-                  <line x1="400" y1="108" x2="400" y2="140" stroke="#d97706" strokeWidth="1.5" opacity="0.7"/>
-                  <line x1="420" y1="108" x2="420" y2="140" stroke="#d97706" strokeWidth="1.5" opacity="0.7"/>
-                  {getTurfStatus(2) === 'available' ? (
-                    <rect x="346" y="111" width="128" height="22" rx="7" fill="#10b981"/>
-                  ) : (
-                    <rect x="346" y="111" width="128" height="22" rx="7" fill="#ef4444"/>
-                  )}
-                  <text x="410" y="125" textAnchor="middle" fill={getTurfStatus(2) === 'available' ? '#0b0f19' : 'white'} fontSize="9" fontWeight="800" fontFamily="Inter,sans-serif">{getTurfStatus(2) === 'available' ? '✓ AVAILABLE' : '✗ BOOKED'}</text>
-                  <text x="410" y="218" textAnchor="middle" fill={selectedTurf === '2' ? '#fbbf24' : '#94a3b8'} fontSize="10" fontWeight="900" fontFamily="Inter,sans-serif">🏏 TURF B (CRICKET)</text>
-                  <text x="410" y="232" textAnchor="middle" fill="#64748b" fontSize="8.5" fontFamily="Inter,sans-serif">8-Over Box Pitch & Nets</text>
-                  {selectedTurf === '2' && <rect x="294" y="46" width="232" height="156" rx="14" fill="none" stroke="#10b981" strokeWidth="2.5" opacity="0.6"/>}
-                </g>
-
-                {/* TURF C: Badminton */}
-                <g onClick={() => handleTurfSelect(3)} onMouseEnter={() => setHoveredTurf('🏸 Turf C — Badminton Indoor')} onMouseLeave={() => setHoveredTurf(null)} style={{cursor:'pointer'}}>
-                  {getTurfStatus(3) === 'available' ? (
-                    <rect x="553" y="45" width="234" height="158" rx="14" fill="none" stroke="#10b981" strokeWidth="2.5" className="animate-glow-green" />
-                  ) : (
-                    <rect x="553" y="45" width="234" height="158" rx="14" fill="none" stroke="#ef4444" strokeWidth="2.5" className="animate-pulse" />
-                  )}
-                  <rect x="558" y="50" width="224" height="148" rx="11" fill={getTurfStatus(3) === 'booked' ? '#271c1c' : '#0c0b24'} stroke={selectedTurf === '3' ? '#10b981' : (getTurfStatus(3) === 'booked' ? '#ef4444' : '#3730a3')} strokeWidth={selectedTurf === '3' ? '2.5' : '1.5'}/>
-                  <rect x="578" y="66" width="184" height="116" fill="none" stroke="#6366f1" strokeWidth="1.2" opacity="0.5"/>
-                  <line x1="670" y1="66" x2="670" y2="182" stroke="#6366f1" strokeWidth="1.8" opacity="0.55"/>
-                  <line x1="558" y1="124" x2="782" y2="124" stroke="#6366f1" strokeWidth="1" opacity="0.45"/>
-                  <line x1="598" y1="66" x2="598" y2="182" stroke="#6366f1" strokeWidth="1" opacity="0.35"/>
-                  <line x1="742" y1="66" x2="742" y2="182" stroke="#6366f1" strokeWidth="1" opacity="0.35"/>
-                  <rect x="614" y="111" width="112" height="22" rx="7" fill={getTurfStatus(3) === 'available' ? '#10b981' : '#ef4444'}/>
-                  <text x="670" y="125" textAnchor="middle" fill={getTurfStatus(3) === 'available' ? '#0b0f19' : 'white'} fontSize="9" fontWeight="800" fontFamily="Inter,sans-serif">{getTurfStatus(3) === 'available' ? '✓ AVAILABLE' : '✗ BOOKED'}</text>
-                  <text x="670" y="218" textAnchor="middle" fill={selectedTurf === '3' ? '#818cf8' : '#94a3b8'} fontSize="10" fontWeight="900" fontFamily="Inter,sans-serif">🏸 TURF C (BADMINTON)</text>
-                  <text x="670" y="232" textAnchor="middle" fill="#64748b" fontSize="8.5" fontFamily="Inter,sans-serif">Wooden Court</text>
-                  {selectedTurf === '3' && <rect x="554" y="46" width="232" height="156" rx="14" fill="none" stroke="#10b981" strokeWidth="2.5" opacity="0.6"/>}
-                </g>
-
-                <line x1="262" y1="124" x2="298" y2="124" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="4 3"/>
-                <line x1="522" y1="124" x2="558" y2="124" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="4 3"/>
-              </svg>
-            </div>
-
-            <div className="text-center mt-5">
-              <p className="text-xs text-slate-500 font-semibold bg-slate-100 px-6 py-3 rounded-2xl border border-slate-200 w-fit mx-auto shadow-inner">
-                💡 <span className="text-[#10b981] font-black">Click any turf pitch above</span> to select it and update the slot view below
-              </p>
-            </div>
-          </div>
-        )}
-
-        {/* GRID CARD VIEW */}
-        {viewMode === 'grid' && (
-          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
-            {TURFS.map((turf) => {
-              const status = getTurfStatus(turf.id);
-              const isSelected = selectedTurf === String(turf.id);
-              return (
-                <div key={turf.id} onClick={() => handleTurfSelect(turf.id)}
-                  className={"relative p-6 rounded-3xl border-2 cursor-pointer transition-all duration-250 hover:-translate-y-1 hover:shadow-2xl " + (isSelected ? turf.selectedClass : 'bg-white border-slate-200 hover:border-slate-300 ' + turf.hoverBorder)}>
-                  <div className="flex justify-between items-start mb-4 mt-1">
-                    <span className={"text-[10px] px-2.5 py-1 rounded-full font-black tracking-wider uppercase bg-slate-100 " + (isSelected ? 'text-[#10b981]' : 'text-slate-500')}>
-                      {status === 'available' ? '● Available' : '● Fully Booked'}
-                    </span>
-                    <span className={"w-3 h-3 rounded-full " + (status === 'available' ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]')}></span>
-                  </div>
-                  <h3 className="text-base font-black tracking-tight text-slate-900">{turf.badge}</h3>
-                  <p className="text-xs text-slate-500 font-semibold mt-1">{turf.venue}</p>
-                  {isSelected && <div className="mt-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></div><span className="text-[10px] text-[#10b981] font-black uppercase tracking-wider">Active slots below ↓</span></div>}
-                </div>
-              );
-            })}
-          </div>
-        )}
-
-        {/* SLOT GRID */}
-        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-xl relative backdrop-blur-md">
-          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#10b981] via-emerald-400 to-teal-500 rounded-t-3xl"></div>
-
-          {/* Date Pill Picker */}
-          <div className="flex flex-col gap-2 mb-8 mt-1">
-            <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Play Date</span>
-            <div className="overflow-x-auto flex gap-3 pb-2">
-              {Array.from({ length: 7 }, (_, i) => {
-                const d = new Date(); d.setDate(d.getDate() + i);
-                const formattedDate = d.toISOString().split('T')[0];
-                const dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
-                const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
-                const isActive = selectedDate === formattedDate;
-                return (
-                  <button key={formattedDate} onClick={() => setSelectedDate(formattedDate)}
-                    className={"flex flex-col items-center justify-center min-w-[90px] py-3 px-4 rounded-2xl border transition-all cursor-pointer flex-shrink-0 " + (isActive ? 'bg-[#10b981] border-transparent text-white shadow-lg font-black' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-100')}>
-                    <span className="text-[9px] font-black uppercase tracking-wider">{i === 0 ? 'TODAY' : dayNames[d.getDay()]}</span>
-                    <span className="text-sm font-black mt-0.5">{d.getDate()} {d.toLocaleString('en',{month:'short'}).toUpperCase()}</span>
-                    {isWeekendDay && <span className={"text-[8px] mt-0.5 font-bold " + (isActive ? 'text-slate-950/80' : 'text-orange-500')}>SURGE</span>}
-                  </button>
-                );
-              })}
-            </div>
-          </div>
-
-          <div className="flex justify-between items-center mb-6 border-t border-slate-200 pt-6">
-            <div>
-              <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
-                <span className="text-[#10b981]">⚡</span>
-                {activeTab === 'premium' ? 'Available Booking Slots' : 'Open Matchmaking Sessions'}
-              </h3>
-              <p className="text-xs text-slate-500 font-semibold mt-0.5">
-                PITCH {selectedTurf === '1' ? 'A (Football)' : selectedTurf === '2' ? 'B (Cricket)' : 'C (Badminton)'} · {selectedDate}
-              </p>
-            </div>
-          </div>
-
-          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
-            {(() => {
-              const filtered = slots.filter(s => activeTab === 'premium' ? s.matchmaking_status !== 'open_for_players' : s.matchmaking_status === 'open_for_players');
-              if (filtered.length === 0) return (
-                <div className="col-span-full text-center py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-slate-500 font-semibold text-sm">
-                  <div className="text-5xl mb-3">⚽</div>
-                  <p className="font-black text-slate-500">No slots found for this date.</p>
-                  <p className="text-xs mt-1">Generate daily slots from the Admin dashboard!</p>
-                </div>
-              );
-              return filtered.map((slot) => {
-                const hour = parseInt(slot.start_time?.split(':')[0] || '0');
-                const pricingTag = slot.pricing_tag || (hour >= 17 && hour <= 22 ? 'SURGE' : 'NORMAL');
-                const isSurge = pricingTag === 'SURGE';
-                const isFlashSale = pricingTag === 'FLASH_SALE';
-                const isMatchmakingSlot = slot.matchmaking_status === 'open_for_players';
-                const dynamicPrice = slot.base_price;
-                const originalPrice = slot.original_price || null;
-                const hasDiscount = originalPrice && Math.round(originalPrice) !== Math.round(dynamicPrice);
-                const displayPrice = activeTab === 'matchmaking' ? Math.round(dynamicPrice / (slot.required_players || 10)) : Math.round(dynamicPrice);
-
-                return (
-                  <div key={slot.id}
-                    className={"relative bg-white border-2 rounded-3xl p-5 flex flex-col justify-between transition-all duration-250 hover:-translate-y-1 hover:shadow-2xl " + (isSurge ? 'border-orange-500/40 hover:border-orange-500' : isFlashSale ? 'border-lime-500/40 hover:border-lime-500' : isMatchmakingSlot ? 'border-indigo-500/40 hover:border-indigo-500' : 'border-slate-200 hover:border-[#10b981]')}
-                    style={{ borderLeftWidth:'4px', borderLeftColor: isSurge ? '#f97316' : isFlashSale ? '#84cc16' : isMatchmakingSlot ? '#6366f1' : '#10b981' }}>
-                    {isMatchmakingSlot && <div className="absolute -top-3 left-4 bg-indigo-600 text-white text-[9px] uppercase font-black px-3 py-1 rounded-full shadow-md">🤝 Open Match ({(slot.required_players||10)-(slot.current_players||0)} Needed)</div>}
-                    {!isMatchmakingSlot && isSurge && <div className="absolute -top-3 left-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[9px] uppercase font-black px-3 py-1 rounded-full shadow-md animate-pulse">🔥 High Demand Surge</div>}
-                    {!isMatchmakingSlot && isFlashSale && <div className="absolute -top-3 left-4 bg-gradient-to-r from-lime-500 to-emerald-500 text-white text-[9px] uppercase font-black px-3 py-1 rounded-full shadow-md">⚡ Flash Sale (30% OFF)</div>}
-                    <div className="mt-3">
-                      <div className="flex justify-between items-center">
-                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Slot #{String(slot.id).padStart(3,'0')}</p>
-                        <span className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">60 min</span>
-                      </div>
-                      <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5">{slot.start_time} – {slot.end_time}</h3>
-                      {isMatchmakingSlot && <p className="text-[10px] text-indigo-400 font-bold mt-1">🏅 {slot.current_players}/{slot.required_players} Players Joined</p>}
-                    </div>
-                    <div className="mt-6 pt-4 border-t border-slate-200">
-                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1.5">{activeTab === 'matchmaking' ? 'Per Player Share' : 'Dynamic Rate'}</p>
-                      <div className="flex items-baseline gap-2 flex-wrap">
-                        <p className="text-3xl font-black text-[#10b981]">₹{displayPrice}</p>
-                        {hasDiscount && activeTab !== 'matchmaking' && <p className="text-sm text-slate-500 line-through font-bold">₹{Math.round(originalPrice)}</p>}
-                        {(isSurge || isFlashSale || (modifiers?.global_multiplier && modifiers.global_multiplier !== 1.0)) && (
-                          <PriceTooltip pricingTag={pricingTag} multiplier={hasDiscount && originalPrice ? dynamicPrice/originalPrice : 1} globalMultiplier={modifiers?.global_multiplier} isWeekend={modifiers?.is_weekend} isRaining={modifiers?.is_raining}/>
-                        )}
                       </div>
                       {isSurge && hasDiscount && <p className="text-[10px] text-orange-400 font-bold mt-0.5">+₹{Math.round(dynamicPrice-originalPrice)} surge applied</p>}
                       {isFlashSale && hasDiscount && <p className="text-[10px] text-lime-400 font-bold mt-0.5">Save ₹{Math.round(originalPrice-dynamicPrice)} with flash deal!</p>}
[diff_block_end]

Please note that the above snippet only shows the MODIFIED lines from the last change. It shows up to 3 lines of unchanged lines before and after the modified lines. The actual file contents may have many more lines not shown.

We did our best to apply changes despite some inaccuracies. Double check if the edit applied is what you intended.