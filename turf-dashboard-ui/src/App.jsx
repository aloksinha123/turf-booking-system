import { fetchApi } from './apiClient';
import React, { useState, useEffect, useMemo } from 'react';
import AdminDashboard from './AdminDashboard';
import Login from './Login';
import LandingPage from './LandingPage';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from './CheckoutForm';
import PaySplit from './PaySplit';
import BookingHistory from './BookingHistory';
import { jsPDF } from 'jspdf';

// Initialize Stripe outside of component to avoid recreating it on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "pk_test_51DummyKeyForLocalDevTest1234567890");

export default function App() {
  // BUG FIX: Determine if this is the PaySplit route BEFORE hooks (read-only, no early return yet)
  const isPaySplitRoute = useMemo(() => window.location.pathname === '/pay-split', []);

  const [slots, setSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [modifiers, setModifiers] = useState(null);
  const [alert, setAlert] = useState({ show: false, message: '', isError: false });
  const [isProcessingId, setIsProcessingId] = useState(null);
  const [selectedTurf, setSelectedTurf] = useState("1");
  const [activeTab, setActiveTab] = useState('premium');
  const [configModal, setConfigModal] = useState({
    isOpen: false, slot: null, isSplit: false, friendsCount: 4, isMatchmaking: false, isMatchmakingJoin: false, idempotencyKey: null
  });
  const [paymentModal, setPaymentModal] = useState({
    isOpen: false,
    bookingId: null,
    amount: 0,
    expiresAt: null,
    clientSecret: null,
    splitTokens: [],
    isConfirmed: false,
    slot: null
  });
  
  // Auth State
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  
  const API_BASE = "http://localhost:8085";

  // Alert system helper
  const triggerAlert = (message, isError = false) => {
    setAlert({ show: true, message, isError });
    setTimeout(() => setAlert({ show: false, message: '', isError: false }), 4000);
  };

  // 1. READ: Fetch live slots from WebSocket backend with date filter
  const loadSlots = async () => {
    try {
      const response = await fetchApi(`${API_BASE}/slots/available?turf_id=${selectedTurf}&date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setSlots(data.slots || []);
        setModifiers(data.modifiers || null);
      }
    } catch (err) {
      console.error("Database status fetch failed:", err);
    }
  };

  // Re-fetch slots when selected date or turf changes
  useEffect(() => {
    if (token) {
      loadSlots();
    }
  }, [selectedTurf, selectedDate, token]);

  // BUG FIX (ISSUE 4): WebSocket listener — auto-refresh slots when server broadcasts slot_update events
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(`ws://localhost:8085/ws`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'slot_update') {
          // Only refresh if the updated turf matches the currently selected turf
          if (String(msg.turf_id) === selectedTurf) {
            loadSlots();
          }
        } else if (msg.type === 'WAITLIST_TURN') {
          if (msg.user_id === user?.id) {
            triggerAlert(`Your waitlisted slot is now available! Book it quickly before someone else does!`, false);
            loadSlots();
          }
        }
      } catch (_) { /* ignore non-JSON messages */ }
    };
    ws.onerror = () => {}; // Suppress console errors if WS unavailable
    return () => {
      if (ws.readyState === 1) ws.close();
      else ws.onopen = () => ws.close(); // Prevent abort error if connecting
    };
  }, [token, selectedTurf]);

  // 2. MUTATION: Handle actual slot booking transactional update
  const confirmBooking = async () => {
    if (!token) return triggerAlert("Please login first", true);
    setIsProcessingId(configModal.slot.id);
    
    const payload = {
      user_id: user?.id || 1,
      slot_id: configModal.slot.id,
      is_split: configModal.isSplit,
      friends_count: configModal.friendsCount,
      is_matchmaking: configModal.isMatchmaking,
      is_matchmaking_join: configModal.isMatchmakingJoin || false
    };

    setConfigModal({ ...configModal, isOpen: false });

    try {
      const response = await fetchApi(`${API_BASE}/slots/book`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "Idempotency-Key": configModal.idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok) {
        const splitLen = data.split_tokens ? data.split_tokens.length : 0;
        const actualAmount = splitLen > 0 
          ? (data.booking_details.final_amount / (splitLen + 1)) 
          : (payload.is_matchmaking_join ? (data.booking_details.final_amount / configModal.slot.required_players) : data.booking_details.final_amount);

        setPaymentModal({
          isOpen: true,
          bookingId: data.booking_details.id,
          amount: actualAmount,
          expiresAt: new Date(data.hold_expires_at),
          clientSecret: data.client_secret,
          splitTokens: data.split_tokens || [],
          isConfirmed: false,
          slot: configModal.slot
        });
        loadSlots(); // Reload fresh database snapshot to remove the held slot
      } else {
        if (response.status === 401) {
          triggerAlert(data.error || "Session expired. Please log in again.", true);
          handleLogout();
          return;
        }
        if (response.status === 409) {
          triggerAlert("This slot was just taken by someone else!", true);
          return;
        }
        triggerAlert(data.error || "Double-booking protection triggered.", true);
      }
    } catch (err) {
      triggerAlert("Network connection disruption.", true);
    } finally {
      setIsProcessingId(null);
    }
  };

  const initiateBooking = (slot) => {
    if (!token) return triggerAlert("Please login first", true);
    // If it's a matchmaking slot, they are joining an existing match
    if (slot.matchmaking_status === 'open_for_players') {
      setConfigModal({ isOpen: true, slot, isSplit: false, friendsCount: 0, isMatchmaking: false, isMatchmakingJoin: true, idempotencyKey: crypto.randomUUID() });
    } else {
      setConfigModal({ isOpen: true, slot, isSplit: false, friendsCount: 4, isMatchmaking: false, isMatchmakingJoin: false, idempotencyKey: crypto.randomUUID() });
    }
  };

  const joinWaitlist = async (slotId) => {
    if (!user) return triggerAlert("Please log in to join the waitlist", true);
    try {
      const res = await fetchApi(`${API_BASE}/slots/${slotId}/waitlist`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join waitlist');
      triggerAlert(data.message, false);
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };


  // 3. PAYMENT: Handle Webhook Simulation
  const handlePayment = async (status) => {
    try {
      const response = await fetchApi(`${API_BASE}/webhooks/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          booking_id: paymentModal.bookingId, 
          status,
          is_primary_split: paymentModal.splitTokens.length > 0
        })
      });
      if (response.ok) {
        triggerAlert(
          status === 'success' ? "Payment Successful! Slot Confirmed. 🎉" : "Payment Failed. Slot Released.", 
          status !== 'success'
        );
        if (status === 'success') {
          setPaymentModal(prev => ({
            ...prev,
            isConfirmed: true,
            clientSecret: null
          }));
          return;
        }
      }
    } catch (err) {
      triggerAlert("Payment webhook request failed.", true);
    } finally {
      if (status !== 'success') {
        setPaymentModal({ isOpen: false, bookingId: null, amount: 0, expiresAt: null, clientSecret: null, splitTokens: [], isConfirmed: false, slot: null });
      }
      loadSlots(); // Refresh slots grid
    }
  };

  const downloadTicketPDF = async (bookingId, slot, amount, isSplit, status = 'pending') => {
    if (!slot) return;
    try {
      const qrData = JSON.stringify({
        booking_id: bookingId,
        turf_id: slot.turf_id,
        turf_name: slot.turf_id === 1 ? "Bovox Arena A" : "Godrej Sky Turf",
        date: slot.date,
        time: `${slot.start_time} - ${slot.end_time}`,
        amount: amount,
        status: isSplit ? "split_pending" : "confirmed"
      });

      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
      
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const qrBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a5"
      });

      // Header Banner
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, 148, 40, "F");

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.text("BOVOX ARENA", 74, 18, { align: "center" });
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.text("DIGITAL TICKET & INVOICE", 74, 25, { align: "center" });

      // Ticket Body
      doc.setTextColor(30, 41, 59);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text(slot.turf_id === 1 ? "Bovox Arena A (Mumbai)" : "Godrej Sky Turf (Mumbai)", 15, 52);

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(15, 57, 133, 57);

      // Details grid
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("BOOKING ID", 15, 66);
      doc.text("DATE", 15, 74);
      doc.text("TIME SLOT", 15, 82);
      doc.text("AMOUNT PAID", 15, 90);
      doc.text("TICKET STATUS", 15, 98);

      doc.setFont("Helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`#${bookingId}`, 55, 66);
      doc.text(slot.date, 55, 74);
      doc.text(`${slot.start_time} - ${slot.end_time}`, 55, 82);
      doc.text(`INR ${amount}`, 55, 90);
      
      if (isSplit && status === 'pending') {
        doc.setTextColor(245, 158, 11);
        doc.text("SPLIT PAYMENT - PENDING", 55, 98);
      } else if (isSplit && (status === 'confirmed' || status === 'completed')) {
        doc.setTextColor(16, 185, 129);
        doc.text("SUCCESSFUL PAYMENT DONE", 55, 98);
      } else {
        doc.setTextColor(16, 185, 129);
        doc.text("CONFIRMED & ACTIVE", 55, 98);
      }

      // Add QR Code
      doc.addImage(qrBase64, "PNG", 49, 110, 50, 50);

      // Footer
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Scan QR Code at the entry gate to verify your booking.", 74, 172, { align: "center" });
      doc.text("Thank you for playing with Bovox!", 74, 178, { align: "center" });

      doc.save(`Ticket_Booking_${bookingId}.pdf`);
      triggerAlert("Ticket downloaded successfully! 📄", false);
    } catch (err) {
      console.error(err);
      triggerAlert("Failed to generate PDF ticket.", true);
    }
  };

  // 4. ADMIN OVERRIDE: Clear database records
  const resetSystem = async () => {
    try {
      const response = await fetchApi(`${API_BASE}/admin/slots/reset`, { 
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        triggerAlert("Database backend state reset successfully!", false);
        loadSlots();
      }
    } catch (err) {
      triggerAlert("Reset command timed out.", true);
    }
  };

  const handleLoginSuccess = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = async () => {
    try {
      await fetchApi(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch (e) {
      console.error('Logout request failed:', e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  // BUG FIX: PaySplit route rendered AFTER all hooks to comply with React Rules of Hooks
  if (isPaySplitRoute) {
    return <PaySplit />;
  }

  if (!token) {
    return (
      <div className="bg-slate-50 min-h-screen font-sans text-slate-800">
        {alert.show && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold transition-all ${
            alert.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {alert.message}
          </div>
        )}
        <Login apiBase={API_BASE} triggerAlert={triggerAlert} onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Helper for Payment Timer
  const PaymentTimer = ({ expiresAt, onExpire }) => {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
      const interval = setInterval(() => {
        const diff = new Date(expiresAt).getTime() - new Date().getTime();
        if (diff <= 0) {
          clearInterval(interval);
          onExpire();
        } else {
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${m}:${s < 10 ? '0' : ''}${s}`);
        }
      }, 1000);
      return () => clearInterval(interval);
    }, [expiresAt]);

    return <span className="font-mono font-black text-rose-600">{timeLeft}</span>;
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-800 relative">      {/* Config Modal (Split / Matchmaking) */}
      {configModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stadium-950/85 backdrop-blur-md p-4">
          <div className="bg-stadium-800 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="bg-stadium-900 border-b border-slate-850 p-6 flex items-center gap-5">
              {/* Glowing Venue Thumbnail SVG */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-900/20 border border-[#10b981]/30 shadow-[0_0_15px_rgba(16,185,129,0.2)] flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-[#10b981]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
                </svg>
              </div>
              <div className="text-left">
                <span className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider">SECURE CHECKOUT</span>
                <h3 className="text-white font-black text-xl tracking-tight mt-1">
                  {configModal.slot?.turf_id == 1 ? "⚽ Turf A (Football)" : configModal.slot?.turf_id == 2 ? "🏏 Turf B (Cricket)" : "🏸 Turf C (Badminton)"}
                </h3>
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  📅 {configModal.slot?.date} &nbsp;|&nbsp; ⏱️ {configModal.slot?.start_time} - {configModal.slot?.end_time}
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-8 bg-[#111827]">
              {configModal.isMatchmakingJoin ? (
                <div className="mb-6 bg-indigo-950/40 border border-indigo-900/60 p-5 rounded-2xl text-left">
                  <h4 className="font-black text-indigo-400 flex items-center gap-2 mb-1 text-sm uppercase tracking-wide">
                    <span>🤝</span> Join Matchmaking Squad
                  </h4>
                  <p className="text-xs text-indigo-200 font-semibold leading-relaxed">
                    You are checking out to buy 1 player slot in this public match. The final cost will be split equally among the squad.
                  </p>
                </div>
              ) : (
                /* Toggle Options cards */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* Option 1: Pay Full */}
                  <div
                    onClick={() => setConfigModal({...configModal, isSplit: false})}
                    className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                      !configModal.isSplit
                        ? 'bg-emerald-950/30 border-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.15)] text-white'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-350'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black uppercase tracking-wider">Pay Full Amount</span>
                      <input type="radio" checked={!configModal.isSplit} onChange={() => {}} className="accent-[#10b981] h-4 w-4" />
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      Instantly book the entire arena. Perfect if you're hosting the full match.
                    </p>
                  </div>

                  {/* Option 2: Split with Squad */}
                  <div
                    onClick={() => setConfigModal({...configModal, isSplit: true})}
                    className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                      configModal.isSplit
                        ? 'bg-indigo-950/30 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-white">Split with Squad</span>
                      <input type="radio" checked={configModal.isSplit} onChange={() => {}} className="accent-indigo-500 h-4 w-4" />
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      Split the bill equally. Send WhatsApp links and open remaining spots.
                    </p>
                  </div>
                </div>
              )}

              {/* Dynamic Split Billing UI */}
              {configModal.isSplit && !configModal.isMatchmakingJoin && (
                <div className="mb-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl text-left animate-in slide-in-from-top-3 duration-250">
                  {/* Squad Members Counter */}
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">Squad Size</h4>
                      <p className="text-[10px] text-slate-500 font-semibold">Excluding you</p>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl">
                      <button 
                        onClick={() => setConfigModal({...configModal, friendsCount: Math.max(1, configModal.friendsCount - 1)})}
                        className="text-slate-400 hover:text-white font-black text-sm w-6 h-6 flex items-center justify-center bg-slate-900 rounded-md border border-slate-800 active:scale-90"
                      >
                        -
                      </button>
                      <span className="text-sm font-black text-white min-w-[50px] text-center">
                        {configModal.friendsCount} Friend{configModal.friendsCount > 1 ? 's' : ''}
                      </span>
                      <button 
                        onClick={() => setConfigModal({...configModal, friendsCount: Math.min(15, configModal.friendsCount + 1)})}
                        className="text-slate-400 hover:text-white font-black text-sm w-6 h-6 flex items-center justify-center bg-slate-900 rounded-md border border-slate-800 active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Share Calculation Box */}
                  <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-4 flex justify-between items-center mb-5">
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Per Player Share</span>
                      <p className="text-2xl font-black text-emerald-400 mt-0.5">
                        ₹{(configModal.slot?.base_price / (configModal.friendsCount + 1)).toFixed(0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Total Slot price</span>
                      <p className="text-sm font-bold text-slate-400 mt-1">₹{configModal.slot?.base_price}</p>
                    </div>
                  </div>

                  {/* Public Matchmaking Toggle Switch */}
                  <div 
                    onClick={() => setConfigModal({...configModal, isMatchmaking: !configModal.isMatchmaking})}
                    className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-slate-850 rounded-xl cursor-pointer hover:bg-slate-950/80 transition-colors"
                  >
                    <div className="text-left">
                      <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                        <span>🤝</span> Open Matchmaking
                      </h4>
                      <p className="text-[9px] text-slate-500 font-bold mt-0.5">Open remaining squad spots to the public list</p>
                    </div>
                    <div className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-250 cursor-pointer ${configModal.isMatchmaking ? 'bg-indigo-500' : 'bg-slate-700'}`}>
                      <div className={`w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-transform duration-250 ${configModal.isMatchmaking ? 'translate-x-4.5' : ''}`}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 border-t border-slate-800 pt-6">
                <button 
                  onClick={() => setConfigModal({isOpen: false, slot: null, isSplit: false, friendsCount: 4, isMatchmaking: false})}
                  className="flex-1 py-3.5 font-black uppercase tracking-wider text-slate-400 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button 
                  onClick={confirmBooking}
                  className="flex-1 py-3.5 font-black uppercase tracking-wider text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  {configModal.isSplit ? 'Lock Slot & Pay Share' : 'Proceed to Checkout'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Gateway Modal */}
      {paymentModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-md p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            {paymentModal.isConfirmed ? (
              // Success Screen for Confirmed Bookings
              <div className="p-8 text-center bg-[#111827] relative overflow-hidden text-slate-100 font-sans">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <span className="text-3xl text-emerald-400">🎉</span>
                </div>
                <h3 className="text-white font-black text-2xl tracking-tight mb-1">Booking Confirmed!</h3>
                <p className="text-emerald-400 text-xs font-black uppercase tracking-wider mb-6">Your slot is locked & active</p>

                <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 text-left space-y-3 mb-6">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-400">Booking ID:</span>
                    <span className="text-white font-bold">#{paymentModal.bookingId}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-400">Turf:</span>
                    <span className="text-white font-bold">
                      {paymentModal.slot?.turf_id == 1 ? "Turf A (Football) - Bovox Arena" : paymentModal.slot?.turf_id == 2 ? "Turf B (Cricket) - Godrej Sky Turf" : "Turf C (Badminton) - Neon Court"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-400">Date:</span>
                    <span className="text-white font-bold">{paymentModal.slot?.date}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-400">Time:</span>
                    <span className="text-white font-bold">{paymentModal.slot?.start_time} - {paymentModal.slot?.end_time}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold border-t border-slate-800 pt-3">
                    <span className="text-slate-400">Amount Paid:</span>
                    <span className="text-emerald-400 font-black">₹{paymentModal.amount}</span>
                  </div>
                </div>

                <div className="flex justify-center mb-6">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                      JSON.stringify({
                        booking_id: paymentModal.bookingId,
                        turf_id: paymentModal.slot?.turf_id,
                        date: paymentModal.slot?.date,
                        time: `${paymentModal.slot?.start_time} - ${paymentModal.slot?.end_time}`,
                        amount: paymentModal.amount,
                        status: "confirmed"
                      })
                    )}`} 
                    alt="Booking QR Code" 
                    className="w-32 h-32 bg-white p-2.5 rounded-2xl shadow-lg border border-slate-850"
                  />
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => downloadTicketPDF(paymentModal.bookingId, paymentModal.slot, paymentModal.amount, false)}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-[#0b0f19] font-black uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/10 active:scale-95 cursor-pointer text-xs"
                  >
                    📥 Download Ticket (PDF)
                  </button>
                  <button 
                    onClick={() => setPaymentModal({isOpen: false, bookingId: null, amount: 0, expiresAt: null, clientSecret: null, splitTokens: [], isConfirmed: false, slot: null})}
                    className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-850 text-slate-300 font-black uppercase tracking-wider py-3 rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : paymentModal.splitTokens.length > 0 && !paymentModal.clientSecret ? (
              // Success Screen for Split Booking
              <div className="p-8 text-center bg-[#111827] relative overflow-hidden text-slate-100 font-sans">
                <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  <span className="text-3xl text-indigo-400">🎉</span>
                </div>
                <h3 className="text-white font-black text-2xl tracking-tight mb-1">Split Initialized!</h3>
                <p className="text-emerald-400 font-bold text-sm mb-6">₹{paymentModal.amount} / ₹{(paymentModal.amount * (paymentModal.splitTokens.length + 1)).toFixed(0)} Collected</p>
                
                {/* Circular Avatar Placeholders for Squad Members */}
                <div className="mb-6 bg-slate-900/40 border border-slate-850 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider block text-left mb-3">Squad Payment Status</span>
                  <div className="flex flex-wrap gap-4 items-center justify-start">
                    {/* Host Avatar (Paid) */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/15 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 font-black text-xs relative">
                        <span>H</span>
                        <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-[#0b0f19] w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black">✓</span>
                      </div>
                      <span className="text-[8px] font-black text-slate-400 uppercase">Host</span>
                    </div>

                    {/* Friend Avatars (Pending) */}
                    {paymentModal.splitTokens.map((t, i) => (
                      <div key={t} className="flex flex-col items-center gap-1">
                        <div className="w-10 h-10 rounded-full bg-slate-900 border-2 border-dashed border-amber-500/30 flex items-center justify-center text-amber-500 font-black text-xs relative animate-pulse">
                          <span>F{i+1}</span>
                          <span className="absolute -bottom-1 -right-1 bg-amber-500 text-[#0b0f19] w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black">?</span>
                        </div>
                        <span className="text-[8px] font-black text-slate-400 uppercase">Friend</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pre-generated Invite Link Card */}
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 text-left mb-6">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider block mb-2">Share Invite Link</span>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-2.5 rounded-xl overflow-hidden">
                      <span className="text-slate-400 font-mono text-[10px] truncate flex-1 select-all">
                        {`http://localhost:5173/pay-split?token=${paymentModal.splitTokens[0]}`}
                      </span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`http://localhost:5173/pay-split?token=${paymentModal.splitTokens[0]}`);
                          triggerAlert("Link copied to clipboard!", false);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-black px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider flex-shrink-0 cursor-pointer transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <a 
                        href={`https://wa.me/?text=${encodeURIComponent(`Hey Squad! I've booked our turf slot for ${paymentModal.slot?.date} at ${paymentModal.slot?.start_time}. Pay your share of ₹${paymentModal.amount} here to confirm your spot: http://localhost:5173/pay-split?token=${paymentModal.splitTokens[0]}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-1 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-black p-2 rounded-xl text-[9px] uppercase tracking-wider cursor-pointer transition-colors"
                      >
                        <span className="text-lg">💬</span> WhatsApp
                      </a>
                      <a 
                        href={`sms:?body=${encodeURIComponent(`Hey Squad! I've booked our turf slot for ${paymentModal.slot?.date} at ${paymentModal.slot?.start_time}. Pay your share of ₹${paymentModal.amount} here to confirm your spot: http://localhost:5173/pay-split?token=${paymentModal.splitTokens[0]}`)}`}
                        className="flex flex-col items-center justify-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-black p-2 rounded-xl text-[9px] uppercase tracking-wider cursor-pointer transition-colors"
                      >
                        <span className="text-lg">📱</span> SMS
                      </a>
                      <a 
                        href={`mailto:?subject=${encodeURIComponent("Turf Booking Share Invite")}&body=${encodeURIComponent(`Hey Squad!\n\nI've booked our turf slot for ${paymentModal.slot?.date} at ${paymentModal.slot?.start_time}.\n\nPay your share of ₹${paymentModal.amount} here to confirm your spot:\nhttp://localhost:5173/pay-split?token=${paymentModal.splitTokens[0]}`)}`}
                        className="flex flex-col items-center justify-center gap-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 font-black p-2 rounded-xl text-[9px] uppercase tracking-wider cursor-pointer transition-colors"
                      >
                        <span className="text-lg">✉️</span> Email
                      </a>
                    </div>
                  </div>
                </div>

                {/* Dynamic QR Preview */}
                <div className="flex justify-center mb-6">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                      JSON.stringify({
                        booking_id: paymentModal.bookingId,
                        turf_id: paymentModal.slot?.turf_id,
                        date: paymentModal.slot?.date,
                        time: `${paymentModal.slot?.start_time} - ${paymentModal.slot?.end_time}`,
                        amount: paymentModal.amount,
                        status: "split_pending"
                      })
                    )}`} 
                    alt="Booking QR Code" 
                    className="w-28 h-28 bg-white p-2 rounded-2xl shadow-lg border border-slate-850"
                  />
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => downloadTicketPDF(paymentModal.bookingId, paymentModal.slot, paymentModal.amount, true)}
                    className="w-full bg-[#1e1b2f] hover:bg-[#2a2642] border border-purple-500/30 text-purple-300 font-black uppercase tracking-wider py-3 rounded-xl transition-colors text-xs cursor-pointer"
                  >
                    📥 Download Split Ticket (PDF)
                  </button>
                  <button 
                    onClick={() => setPaymentModal({isOpen: false, bookingId: null, amount: 0, expiresAt: null, clientSecret: null, splitTokens: [], isConfirmed: false, slot: null})}
                    className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-850 text-slate-350 font-black uppercase tracking-wider py-2.5 rounded-xl transition-colors text-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              // Standard Checkout View
              <>
                <div className="bg-[#0b0f19] border-b border-slate-850 p-6 text-center">
                  <h3 className="text-white font-black text-xl tracking-tight uppercase tracking-wider">Secure Payment Gateway</h3>
                  <p className="text-slate-400 text-xs font-semibold mt-1">Stripe Mock Terminal</p>
                </div>
                <div className="p-8">
                  <div className="text-center mb-8">
                    <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] mb-2">
                      {paymentModal.splitTokens.length > 0 ? 'Your Share Due' : 'Total Amount Due'}
                    </p>
                    <p className="text-5xl font-black text-white">₹{paymentModal.amount}</p>
                  </div>
                  
                  <div className="bg-rose-500/10 border border-rose-500/35 rounded-2xl p-4 text-center mb-6">
                    <p className="text-rose-300 text-xs font-black uppercase tracking-wider">
                       ⏱️ Slot held for <PaymentTimer expiresAt={paymentModal.expiresAt} onExpire={() => handlePayment('failed')} />
                    </p>
                    <p className="text-slate-500 text-[10px] font-bold mt-1">Complete payment before timer expires</p>
                  </div>

                  {paymentModal.clientSecret && paymentModal.clientSecret.includes('mock') ? (
                    <div className="space-y-3">
                      <button 
                        onClick={async () => {
                          if (paymentModal.splitTokens.length > 0) {
                            try {
                              await fetchApi(`${API_BASE}/webhooks/payment`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ booking_id: paymentModal.bookingId, status: "success", is_primary_split: true })
                              });
                            } catch (e) {
                              console.error("Mock webhook failed", e);
                            }
                            setPaymentModal({...paymentModal, clientSecret: null});
                            loadSlots();
                          } else {
                            handlePayment('success');
                          }
                        }}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95 text-lg"
                      >
                        Pay ₹{paymentModal.amount}
                      </button>
                      <button 
                        onClick={() => handlePayment('failed')}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all"
                      >
                        Cancel Booking
                      </button>
                    </div>
                  ) : paymentModal.clientSecret && (
                    <Elements stripe={stripePromise} options={{ clientSecret: paymentModal.clientSecret }}>
                      <CheckoutForm 
                        amount={paymentModal.amount} 
                        expiresAt={paymentModal.expiresAt} 
                        onSuccess={async () => {
                          if (paymentModal.splitTokens.length > 0) {
                            try {
                              await fetchApi(`${API_BASE}/webhooks/payment`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ booking_id: paymentModal.bookingId, status: "success", is_primary_split: true })
                              });
                            } catch (e) {
                              console.error("Mock webhook failed", e);
                            }
                            setPaymentModal({...paymentModal, clientSecret: null});
                            loadSlots();
                          } else {
                            handlePayment('success');
                          }
                        }}
                        onFail={() => handlePayment('failed')}
                      />
                    </Elements>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Alert Banner System */}
      {alert.show && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-sm font-bold transition-all animate-in slide-in-from-top-4 ${
          alert.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {alert.message}
        </div>
      )}

      {user?.role === 'admin' ? (
        <>
          {/* Admin Top Navbar */}
          <header className="bg-[#0b0f19] border-b border-[#1e293b] sticky top-0 z-40">
            <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex justify-between items-center">
              
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-black text-[#0b0f19] text-xs shadow-lg shadow-emerald-500/15 border border-emerald-400/30 uppercase">
                  {user?.name ? user.name.substring(0, 2) : 'U'}
                </div>
                <div>
                  <h1 className="text-sm font-black text-white tracking-tight">{user?.name || 'Admin'}</h1>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                    Platform Admin
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={handleLogout}
                  className="bg-[#111827] hover:bg-[#1e293b] border border-[#1e293b] text-slate-400 text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Log Out
                </button>
                <button 
                  onClick={resetSystem} 
                  className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 font-black px-3.5 py-2 rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                >
                  Reset DB
                </button>
              </div>
            </div>
          </header>

          <div className="bg-[#080c14] min-h-screen p-6 md:p-8">
            <AdminDashboard apiBase={API_BASE} triggerAlert={triggerAlert} token={token} />
          </div>
        </>
      ) : (
        <LandingPage
          slots={slots}
          initiateBooking={initiateBooking}
          joinWaitlist={joinWaitlist}
          isProcessingId={isProcessingId}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          selectedTurf={selectedTurf}
          setSelectedTurf={setSelectedTurf}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          modifiers={modifiers}
          user={user}
          handleLogout={handleLogout}
          resetSystem={resetSystem}
          BookingHistory={BookingHistory}
          API_BASE={API_BASE}
          downloadTicketPDF={downloadTicketPDF}
          triggerAlert={triggerAlert}
        />
      )}
    </div>
  );
}