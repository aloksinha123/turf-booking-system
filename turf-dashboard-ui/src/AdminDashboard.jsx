import { fetchApi } from './apiClient';
import { useState, useEffect, useCallback } from 'react';
import StressDashboard from './StressDashboard';
import { useWebSocket } from './useWebSocket';
import ToastContainer from './ToastContainer';

export default function AdminDashboard({ apiBase, triggerAlert, token }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'inventory' | 'pricing' | 'finance' | 'chaos' | 'audit'

  const [multiplier, setMultiplier] = useState(1.0);
  const [slots, setSlots] = useState([]);
  const [isApplying, setIsApplying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [priceOverride, setPriceOverride] = useState({ show: false, slotId: null, slotLabel: '', currentPrice: 0, newPrice: '' });

  const [analytics, setAnalytics] = useState({
    total_revenue: 0,
    active_bookings: 0,
    peak_attendance_rate: 0,
    hourly_volume: []
  });

  const [pricingRules, setPricingRules] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [yieldAnalytics, setYieldAnalytics] = useState(null);

  // New Rule Form
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('holiday');
  const [ruleMultiplier, setRuleMultiplier] = useState('1.25');
  const [rulePriority, setRulePriority] = useState('20');
  const [submittingRule, setSubmittingRule] = useState(false);

  // New Coupon Form
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponValInput, setCouponValInput] = useState('20');
  const [couponAllowSurge, setCouponAllowSurge] = useState(false);
  const [submittingCoupon, setSubmittingCoupon] = useState(false);

  // Command Center Feature 5 State
  const [v2Analytics, setV2Analytics] = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState('today');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [systemHealth, setSystemHealth] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState({ is_maintenance: false, reason: '' });
  const [activityLogs, setActivityLogs] = useState([]);
  const [selectedSlotIDs, setSelectedSlotIDs] = useState([]);
  const [bulkPriceModal, setBulkPriceModal] = useState({ show: false, newPrice: '800' });
  const [bulkGenModal, setBulkGenModal] = useState({ show: false, startDate: selectedDate, endDate: selectedDate, turfId: '1', basePrice: '500' });
  const [financeSummary, setFinanceSummary] = useState(null);

  // Load all slots and analytics for Admin
  const loadAdminData = async () => {
    try {
      // Fetch Slots
      const resSlots = await fetchApi(`${apiBase}/admin/slots?date=${selectedDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resSlots.status === 401) {
        triggerAlert("Session expired or database reset. Please log in again.", true);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
        return;
      }

      if (resSlots.ok) {
        const data = await resSlots.json();
        setSlots(data.slots || []);
        setMultiplier(data.current_multiplier || 1.0);
      }

      // Fetch Analytics
      const resAnalytics = await fetchApi(`${apiBase}/admin/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resAnalytics.ok) {
        const data = await resAnalytics.json();
        setAnalytics(data);
      }

      // Fetch Pricing Rules
      const resRules = await fetchApi(`${apiBase}/admin/pricing-rules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resRules.ok) {
        const rulesData = await resRules.json();
        setPricingRules(rulesData || []);
      }

      // Fetch Coupons
      const resCoupons = await fetchApi(`${apiBase}/admin/coupons`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resCoupons.ok) {
        const couponData = await resCoupons.json();
        setCoupons(couponData || []);
      }

      // Fetch Yield Analytics
      const resYield = await fetchApi(`${apiBase}/admin/pricing/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resYield.ok) {
        const yieldData = await resYield.json();
        setYieldAnalytics(yieldData);
      }

      // Fetch V2 Multi-Range Analytics
      let v2Url = `${apiBase}/admin/v2/analytics?range=${analyticsRange}`;
      if (statusFilter) v2Url += `&status=${statusFilter}`;
      if (startDateFilter) v2Url += `&start_date=${startDateFilter}`;
      if (endDateFilter) v2Url += `&end_date=${endDateFilter}`;

      const resV2 = await fetchApi(v2Url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resV2.ok) {
        const v2Data = await resV2.json();
        setV2Analytics(v2Data);
      }

      // Fetch System Health
      const resHealth = await fetchApi(`${apiBase}/admin/system/health`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resHealth.ok) {
        const healthData = await resHealth.json();
        setSystemHealth(healthData);
      }

      // Fetch Maintenance Status
      const resMaint = await fetchApi(`${apiBase}/api/v1/system/status`);
      if (resMaint.ok) {
        const maintData = await resMaint.json();
        setMaintenanceMode(maintData);
      }

      // Fetch Activity Audit Logs
      const resLogs = await fetchApi(`${apiBase}/admin/activity-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resLogs.ok) {
        const logsData = await resLogs.json();
        setActivityLogs(logsData || []);
      }

      // Fetch Finance & Webhook Audit Ledger Summary
      const resFinance = await fetchApi(`${apiBase}/admin/finance/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resFinance.ok) {
        const finData = await resFinance.json();
        setFinanceSummary(finData);
      }
    } catch (err) {
      console.error("Admin fetch failed:", err);
    }
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    const multVal = parseFloat(ruleMultiplier);
    if (isNaN(multVal) || multVal <= 0) {
      return triggerAlert("Invalid multiplier! Must be greater than 0x (e.g. 1.25x)", true);
    }

    try {
      setSubmittingRule(true);
      const res = await fetchApi(`${apiBase}/admin/pricing-rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: ruleName,
          rule_type: ruleType,
          multiplier: multVal,
          priority: parseInt(rulePriority) || 10,
          is_active: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create rule');

      triggerAlert(data.message, false);
      setRuleName('');
      loadAdminData();
    } catch (err) {
      triggerAlert(err.message, true);
    } finally {
      setSubmittingRule(false);
    }
  };

  const handleToggleRule = async (ruleId) => {
    try {
      const res = await fetchApi(`${apiBase}/admin/pricing-rules/${ruleId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert(data.message, false);
        loadAdminData();
      }
    } catch (err) {
      triggerAlert('Failed to toggle rule', true);
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!couponCodeInput.trim()) return triggerAlert('Enter a coupon code', true);

    try {
      setSubmittingCoupon(true);
      const res = await fetchApi(`${apiBase}/admin/coupons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: couponCodeInput,
          discount_type: 'percentage',
          discount_value: parseFloat(couponValInput) || 20,
          allow_with_surge: couponAllowSurge,
          is_active: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create coupon');

      triggerAlert('Coupon created successfully! 🎉', false);
      setCouponCodeInput('');
      loadAdminData();
    } catch (err) {
      triggerAlert(err.message, true);
    } finally {
      setSubmittingCoupon(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [apiBase, selectedDate, analyticsRange, statusFilter, startDateFilter, endDateFilter]);

  // Partial State Mutation & Typed Event Dispatcher
  const handleWSEvent = useCallback((event) => {
    const { type, payload } = event;

    if (type === 'SLOT_UPDATED' && payload?.slot_id) {
      setSlots((prevSlots) =>
        prevSlots.map((s) => {
          if (s.id === payload.slot_id) {
            return {
              ...s,
              is_locked: payload.is_locked !== undefined ? payload.is_locked : s.is_locked,
              is_booked: payload.status === 'booked' ? true : payload.status === 'available' ? false : s.is_booked,
              ...(payload.slot || {}),
            };
          }
          return s;
        })
      );
    }

    if (
      type === 'BOOKING_CREATED' ||
      type === 'PRICE_CHANGED' ||
      type === 'MATCHMAKING_UPDATED' ||
      type === 'SYSTEM_MAINTENANCE'
    ) {
      loadAdminData();
    }
  }, []);

  const handleFallbackPoll = useCallback(() => {
    loadAdminData();
  }, []);

  const wsUrl = `ws://localhost:8085/ws`;
  const { status: wsStatus, onlineCount, lastSeqId, toasts, removeToast } = useWebSocket({
    wsUrl,
    token,
    onEvent: handleWSEvent,
    onFallbackPoll: handleFallbackPoll,
  });

  // Slot selection handlers for Bulk operations
  const handleToggleSlotSelect = (slotId) => {
    if (selectedSlotIDs.includes(slotId)) {
      setSelectedSlotIDs(selectedSlotIDs.filter(id => id !== slotId));
    } else {
      setSelectedSlotIDs([...selectedSlotIDs, slotId]);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedSlotIDs(slots.map(s => s.id));
    } else {
      setSelectedSlotIDs([]);
    }
  };

  // CSV Data Export Handler
  const handleExportBookingsCSV = () => {
    let url = `${apiBase}/admin/export/bookings?status=${statusFilter}`;
    if (startDateFilter) url += `&start_date=${startDateFilter}`;
    if (endDateFilter) url += `&end_date=${endDateFilter}`;
    window.open(url, '_blank');
  };

  // Toggle System Maintenance
  const handleToggleMaintenance = async () => {
    const nextState = !maintenanceMode.is_maintenance;
    let reason = maintenanceMode.reason;
    if (nextState) {
      const inputReason = window.prompt("Enter maintenance reason text for customers:", "Scheduled system upgrade in progress.");
      if (inputReason !== null) reason = inputReason;
    }

    try {
      const res = await fetchApi(`${apiBase}/admin/system/maintenance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          is_maintenance: nextState,
          reason
        })
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert(data.message, false);
        loadAdminData();
      }
    } catch (err) {
      triggerAlert("Failed to toggle maintenance mode", true);
    }
  };

  // Bulk Price Update Submit
  const handleBulkPriceSubmit = async (e) => {
    e.preventDefault();
    const p = parseFloat(bulkPriceModal.newPrice);
    if (isNaN(p) || p <= 0) return triggerAlert("Invalid bulk price", true);

    try {
      const res = await fetchApi(`${apiBase}/admin/slots/bulk-price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slot_ids: selectedSlotIDs,
          date: selectedDate,
          new_price: p
        })
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert(data.message, false);
        setBulkPriceModal({ show: false, newPrice: '800' });
        setSelectedSlotIDs([]);
        loadAdminData();
      }
    } catch (err) {
      triggerAlert("Failed to update bulk price", true);
    }
  };

  // Bulk Lock/Unlock Submit
  const handleBulkLockToggle = async (lockState) => {
    if (selectedSlotIDs.length === 0) return triggerAlert("Please select slots using checkboxes first", true);

    try {
      const res = await fetchApi(`${apiBase}/admin/slots/bulk-lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slot_ids: selectedSlotIDs,
          is_locked: lockState
        })
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert(data.message, false);
        setSelectedSlotIDs([]);
        loadAdminData();
      }
    } catch (err) {
      triggerAlert("Failed bulk lock action", true);
    }
  };

  // Bulk Multi-Date Slot Generation Submit
  const handleBulkGenSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetchApi(`${apiBase}/admin/slots/bulk-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          turf_id: parseInt(bulkGenModal.turfId),
          start_date: bulkGenModal.startDate,
          end_date: bulkGenModal.endDate,
          base_price: parseFloat(bulkGenModal.basePrice) || 500
        })
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert(data.message, false);
        setBulkGenModal({ ...bulkGenModal, show: false });
        loadAdminData();
      }
    } catch (err) {
      triggerAlert("Failed to generate bulk slots", true);
    }
  };

  // Toggle Emergency Lock
  const toggleLock = async (slotId) => {
    try {
      const res = await fetchApi(`${apiBase}/admin/slots/${slotId}/toggle-lock`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle lock');

      setSlots(slots.map(s => s.id === slotId ? { ...s, is_locked: data.is_locked } : s));
      triggerAlert(`Slot #${slotId} ${data.is_locked ? 'LOCKED 🔒' : 'UNLOCKED 🔓'}`, false);
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };

  // Open Price Override Modal
  const openPriceModal = (slot) => {
    setPriceOverride({
      show: true,
      slotId: slot.id,
      slotLabel: `${slot.start_time} - ${slot.end_time}`,
      currentPrice: slot.base_price,
      newPrice: slot.base_price.toString()
    });
  };

  // Submit Price Override
  const submitPriceOverride = async (e) => {
    e.preventDefault();
    const newP = parseFloat(priceOverride.newPrice);
    if (isNaN(newP) || newP <= 0) return triggerAlert("Invalid price", true);

    try {
      const res = await fetchApi(`${apiBase}/admin/slots/${priceOverride.slotId}/override-price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ base_price: newP })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to override price');

      triggerAlert(data.message, false);
      setPriceOverride({ show: false, slotId: null, slotLabel: '', currentPrice: 0, newPrice: '' });
      loadAdminData();
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };

  // Seed Demo Data
  const seedDemoData = async () => {
    if (!window.confirm("Seed demo bookings for real-time analytics testing?")) return;
    try {
      setIsSeeding(true);
      const res = await fetchApi(`${apiBase}/admin/seed-demo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to seed demo data');

      triggerAlert(data.message, false);
      loadAdminData();
    } catch (err) {
      triggerAlert(err.message, true);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950 pb-24">
      {/* Real-time Toast Alerts */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Maintenance Mode Emergency Alert Banner */}
      {maintenanceMode.is_maintenance && (
        <div className="bg-gradient-to-r from-rose-900 via-red-800 to-rose-950 border-b border-rose-500/40 text-white px-6 py-3 shadow-2xl flex items-center justify-between text-xs font-black tracking-wide">
          <div className="flex items-center gap-3">
            <span className="bg-rose-500 text-slate-950 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold animate-pulse">EMERGENCY MODE ACTIVE</span>
            <span>{maintenanceMode.reason || "System undergoing maintenance. Customer bookings paused."}</span>
          </div>
          <button 
            onClick={handleToggleMaintenance}
            className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg text-white font-bold transition-all border border-white/20 cursor-pointer"
          >
            Turn Off
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* EXECUTIVE TOP HEADER NAVIGATION                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-[#090d18]/90 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-indigo-500 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center font-black text-emerald-400 text-lg">
                🛡️
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white tracking-tight">Turf Executive Hub</h1>
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold text-[10px] uppercase px-2.5 py-0.5 rounded-full tracking-wider">Platform Owner</span>
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Real-Time Yield Pricing, Concurrency Telemetry & Financial Ledger</p>
            </div>
          </div>

          {/* Quick Actions & Live Telemetry Pills */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
            
            {/* Live Telemetry Pill */}
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 shadow-inner">
              {wsStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-emerald-400">🟢 Live Telemetry</span>
                  <span className="text-slate-700">|</span>
                  <span className="text-indigo-300 font-mono text-[11px]">Seq #{lastSeqId || 0}</span>
                  <span className="text-slate-700">|</span>
                  <span>👥 {onlineCount} Online</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span className="text-rose-400">🔴 Polling Mode</span>
                </>
              )}
            </div>

            {/* CSV Export Button */}
            <button
              onClick={handleExportBookingsCSV}
              className="bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              📥 Export CSV
            </button>

            {/* Seed Demo Button */}
            <button
              onClick={seedDemoData}
              disabled={isSeeding}
              className="bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              {isSeeding ? '🌱 Seeding...' : '🌱 Seed Demo Data'}
            </button>

            {/* Maintenance Toggle */}
            <button
              onClick={handleToggleMaintenance}
              className={`font-black text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5 border ${
                maintenanceMode.is_maintenance
                  ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white animate-pulse'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
              }`}
            >
              {maintenanceMode.is_maintenance ? '🚫 MAINTENANCE ACTIVE' : '🔧 Maintenance Mode'}
            </button>
          </div>
        </div>

        {/* Executive Tabbed Navigation Bar */}
        <div className="max-w-[1440px] mx-auto px-6 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto py-2.5 scrollbar-none">
          {[
            { id: 'overview', label: '📊 Overview & Revenue Analytics' },
            { id: 'inventory', label: '📅 Slot Inventory & Bulk Controls' },
            { id: 'pricing', label: '⚡ Dynamic Yield Pricing Engine' },
            { id: 'finance', label: '💰 Finance & Webhook Ledger' },
            { id: 'chaos', label: '🔥 Chaos Concurrency Suite' },
            { id: 'audit', label: '📜 Security Audit Logs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer border ${
                activeTab === tab.id
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB CONTENT CONTAINER                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <main className="max-w-[1440px] mx-auto px-6 pt-8">

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW & REVENUE ANALYTICS                                   */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* AI Insights & Revenue Range Filter Toolbar */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">Executive Summary</span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">Revenue & Occupancy Analytics</h2>
                <p className="text-xs text-slate-400 font-semibold mt-1">Multi-timeframe financial yield and peak slot utilization telemetry</p>
              </div>

              {/* Time-Range Switcher */}
              <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-2 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-black uppercase text-slate-500 px-3">Range:</span>
                {['today', 'weekly', 'monthly', 'yearly', 'custom'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setAnalyticsRange(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                      analyticsRange === r
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Top Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Gross Revenue Card */}
              <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-emerald-950/30 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Total Revenue</span>
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-lg">
                    💰
                  </div>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight">₹{analytics.total_revenue?.toLocaleString() || 0}</h3>
                <p className="text-xs text-emerald-400 font-bold mt-2 flex items-center gap-1">
                  <span>📈</span> Real-time calculated yield
                </p>
              </div>

              {/* Confirmed Bookings Card */}
              <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/30 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Confirmed Bookings</span>
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-lg">
                    🎟️
                  </div>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight">{analytics.active_bookings || 0}</h3>
                <p className="text-xs text-indigo-300 font-bold mt-2">Verified reservation count</p>
              </div>

              {/* Peak Attendance Rate */}
              <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-purple-950/30 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-purple-500/40 transition-all">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Occupancy Rate</span>
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-black text-lg">
                    ⚡
                  </div>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight">{analytics.peak_attendance_rate || 0}%</h3>
                <p className="text-xs text-purple-300 font-bold mt-2">Slot utilization efficiency</p>
              </div>

              {/* Active Pricing Rules */}
              <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-amber-950/30 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition-all">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Active Yield Rules</span>
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-lg">
                    📊
                  </div>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tight">{pricingRules.filter(r => r.is_active).length}</h3>
                <p className="text-xs text-amber-300 font-bold mt-2">Dynamic surge & flash rules</p>
              </div>
            </div>

            {/* AI Insights & Hourly Volume Bar Chart */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">Hourly Slot Booking Volume</h3>
                  <p className="text-xs text-slate-400 font-semibold">Distribution of player bookings across 24-hour time slots</p>
                </div>
                <span className="text-xs font-black text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">
                  Peak Hours: 17:00 - 22:00
                </span>
              </div>

              {/* Bar Chart Visual */}
              <div className="grid grid-cols-12 gap-2 h-44 items-end pt-6 border-b border-slate-800/80 pb-4">
                {(analytics.hourly_volume && analytics.hourly_volume.length > 0 ? analytics.hourly_volume : Array(12).fill({ hour: '18:00', count: 4 })).map((item, idx) => {
                  const maxCount = Math.max(...(analytics.hourly_volume?.map(h => h.count) || [5]), 5);
                  const pct = Math.min(100, Math.max(15, (item.count / maxCount) * 100));
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2 group h-full justify-end">
                      <div 
                        className="w-full bg-gradient-to-t from-emerald-600 via-teal-500 to-indigo-500 rounded-t-xl group-hover:from-emerald-400 group-hover:to-indigo-400 transition-all duration-300 shadow-md relative"
                        style={{ height: `${pct}%` }}
                      >
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-950 text-white text-[10px] font-black px-2 py-0.5 rounded border border-slate-800 shadow-lg whitespace-nowrap">
                          {item.count || 0} bookings
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{item.hour || `${idx+10}:00`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: SLOT INVENTORY & BULK CONTROLS                                  */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'inventory' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Inventory Controls Bar */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">Inventory Management</span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">Slot Schedule & Bulk Actions</h2>
                <p className="text-xs text-slate-400 font-semibold mt-1">Manage daily turf slots, price overrides, and multi-select locking</p>
              </div>

              {/* Date Switcher & Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl outline-none focus:border-emerald-500 transition-all cursor-pointer shadow-inner"
                />

                <button 
                  onClick={() => setBulkGenModal({ ...bulkGenModal, show: true })}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg cursor-pointer"
                >
                  ⚡ Bulk Generate Slots
                </button>
              </div>
            </div>

            {/* Multi-Select Bulk Actions Toolbar */}
            {selectedSlotIDs.length > 0 && (
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-500 text-slate-950 font-black text-xs px-2.5 py-1 rounded-lg">
                    {selectedSlotIDs.length} Selected
                  </span>
                  <span className="text-xs font-bold text-emerald-300">Slots ready for bulk action</span>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setBulkPriceModal({ ...bulkPriceModal, show: true })}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    ✏️ Bulk Edit Price
                  </button>
                  <button 
                    onClick={() => handleBulkLockToggle(true)}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    🔒 Bulk Lock
                  </button>
                  <button 
                    onClick={() => handleBulkLockToggle(false)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    🔓 Bulk Unlock
                  </button>
                </div>
              </div>
            )}

            {/* Slot Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {slots.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl text-slate-500 font-bold text-sm">
                  No slots found for {selectedDate}. Click "Bulk Generate Slots" to populate!
                </div>
              ) : (
                slots.map((slot) => {
                  const isSelected = selectedSlotIDs.includes(slot.id);
                  const isSurge = slot.pricing_tag === 'SURGE';
                  const isFlashSale = slot.pricing_tag === 'FLASH_SALE';

                  return (
                    <div 
                      key={slot.id} 
                      className={`bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 relative group shadow-xl ${
                        isSelected 
                          ? 'border-emerald-500 shadow-emerald-500/10 bg-slate-900' 
                          : slot.is_locked 
                          ? 'border-rose-800/60 opacity-60' 
                          : slot.is_booked 
                          ? 'border-indigo-500/50 bg-slate-900/50' 
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSlotSelect(slot.id)}
                          className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                          slot.is_locked 
                            ? 'bg-rose-950/80 border-rose-700 text-rose-300' 
                            : slot.is_booked 
                            ? 'bg-indigo-950/80 border-indigo-700 text-indigo-300' 
                            : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                        }`}>
                          {slot.is_locked ? 'Locked 🔒' : slot.is_booked ? 'Booked 🎟️' : 'Available 🟢'}
                        </span>
                      </div>

                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Slot #{String(slot.id).padStart(3, '0')}</p>
                        <h3 className="text-2xl font-black text-white tracking-tight">{slot.start_time} - {slot.end_time}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xl font-black text-emerald-400">₹{slot.base_price}</span>
                          {slot.original_price && slot.original_price !== slot.base_price && (
                            <span className="line-through text-slate-500 text-xs">₹{slot.original_price}</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <button 
                          onClick={() => openPriceModal(slot)}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2 rounded-xl transition-all cursor-pointer"
                        >
                          ✏️ Edit Price
                        </button>
                        <button 
                          onClick={() => toggleLock(slot.id)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            slot.is_locked ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {slot.is_locked ? 'Unlock' : 'Lock'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: DYNAMIC YIELD PRICING ENGINE                                   */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'pricing' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Header & Multiplier Summary */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">Yield Pricing Engine</span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">Dynamic Rules & Coupon Controls</h2>
                <p className="text-xs text-slate-400 font-semibold mt-1">Configure peak-surge, monsoon discounts, and promo coupons</p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                <span className="text-xs font-bold text-slate-400 uppercase">Current Yield Score:</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">{multiplier.toFixed(2)}x</span>
              </div>
            </div>

            {/* Rules & Coupon Forms Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Create Pricing Rule Form */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>⚡</span> Add Dynamic Yield Rule
                </h3>
                <form onSubmit={handleCreateRule} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">Rule Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Prime Time Peak Surge"
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 font-bold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1">Rule Type</label>
                      <select 
                        value={ruleType}
                        onChange={(e) => setRuleType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 font-bold cursor-pointer"
                      >
                        <option value="peak_hour">Peak Hour (Surge)</option>
                        <option value="last_minute">Last-Minute (Discount)</option>
                        <option value="weather">Weather Flash Discount</option>
                        <option value="holiday">Holiday Surge</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-400 block mb-1">Multiplier (e.g. 1.5x)</label>
                      <input 
                        type="number"
                        step="0.05"
                        value={ruleMultiplier}
                        onChange={(e) => setRuleMultiplier(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 font-bold"
                        required
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={submittingRule}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-3 rounded-xl transition-all shadow-lg cursor-pointer"
                  >
                    {submittingRule ? 'Saving Rule...' : 'Create Yield Rule'}
                  </button>
                </form>
              </div>

              {/* Create Coupon Form */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>🎟️</span> Add Promotional Coupon
                </h3>
                <form onSubmit={handleCreateCoupon} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">Coupon Code</label>
                    <input 
                      type="text"
                      placeholder="e.g. SURGE20"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 font-bold uppercase"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">Discount % Value</label>
                    <input 
                      type="number"
                      value={couponValInput}
                      onChange={(e) => setCouponValInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-emerald-500 font-bold"
                      required
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={submittingCoupon}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs py-3 rounded-xl transition-all shadow-lg cursor-pointer"
                  >
                    {submittingCoupon ? 'Saving Coupon...' : 'Create Coupon Code'}
                  </button>
                </form>
              </div>
            </div>

            {/* Active Pricing Rules Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-black text-white tracking-tight">Active Yield Pricing Rules</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Rule Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Multiplier</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-semibold">
                    {pricingRules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-bold text-white">{rule.name}</td>
                        <td className="p-3 uppercase text-[10px] text-slate-400">{rule.rule_type}</td>
                        <td className="p-3 font-mono font-bold text-emerald-400">{rule.multiplier}x</td>
                        <td className="p-3">{rule.priority}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${rule.is_active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                            {rule.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button 
                            onClick={() => handleToggleRule(rule.id)}
                            className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded-lg text-white font-bold cursor-pointer"
                          >
                            Toggle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: FINANCE & WEBHOOK LEDGER                                       */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'finance' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Finance Metrics Header */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">Financial Reconciliation</span>
                <h2 className="text-2xl font-black text-white tracking-tight mt-2">Payment Ledger & Webhook Idempotency</h2>
                <p className="text-xs text-slate-400 font-semibold mt-1">Audit transactions, Stripe webhook event processing, and digital ticket codes</p>
              </div>

              {financeSummary?.metrics && (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="bg-slate-950/80 px-4 py-2 rounded-2xl border border-slate-800">
                    <span className="text-[10px] font-black uppercase text-slate-500 block">Gross Revenue</span>
                    <span className="text-xl font-black text-emerald-400 font-mono">₹{financeSummary.metrics.gross_revenue}</span>
                  </div>
                  <div className="bg-slate-950/80 px-4 py-2 rounded-2xl border border-slate-800">
                    <span className="text-[10px] font-black uppercase text-slate-500 block">Total Refunds</span>
                    <span className="text-xl font-black text-rose-400 font-mono">₹{financeSummary.metrics.total_refunds}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Webhook Idempotency Event Logs */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                <span>🛡️</span> Webhook Idempotency Audit Logs
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Event ID</th>
                      <th className="p-3">Event Type</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Payload Summary</th>
                      <th className="p-3 text-right">Processed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-semibold font-mono text-[11px]">
                    {financeSummary?.webhook_events?.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-slate-500 font-sans">No webhook events logged yet</td>
                      </tr>
                    ) : (
                      financeSummary?.webhook_events?.map((evt) => (
                        <tr key={evt.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 text-white font-bold">{evt.event_id}</td>
                          <td className="p-3 text-emerald-400">{evt.event_type}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              evt.status === 'processed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {evt.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400">{evt.payload}</td>
                          <td className="p-3 text-right text-slate-500">{new Date(evt.processed_at).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 5: CHAOS CONCURRENCY SUITE                                        */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'chaos' && (
          <div className="space-y-8 animate-fadeIn">
            <StressDashboard apiBase={apiBase} token={token} onTestComplete={loadAdminData} />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 6: SECURITY AUDIT LOGS                                            */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'audit' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* System Health Card */}
            {systemHealth && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-wrap items-center justify-between gap-6">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">Telemetry</span>
                  <h2 className="text-2xl font-black text-white tracking-tight mt-2">Database & Server Health</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-1">PostgreSQL connection pool and memory metrics</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="bg-slate-950/80 px-4 py-2 rounded-2xl border border-slate-800 text-xs">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Active DB Conns</span>
                    <span className="font-mono font-black text-emerald-400 text-lg">{systemHealth.open_connections}</span>
                  </div>
                  <div className="bg-slate-950/80 px-4 py-2 rounded-2xl border border-slate-800 text-xs">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">In Use</span>
                    <span className="font-mono font-black text-indigo-400 text-lg">{systemHealth.in_use_connections}</span>
                  </div>
                  <div className="bg-slate-950/80 px-4 py-2 rounded-2xl border border-slate-800 text-xs">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase">Idle Pool</span>
                    <span className="font-mono font-black text-purple-400 text-lg">{systemHealth.idle_connections}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Admin Activity Audit Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                <span>📜</span> Admin Action Audit Trail
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Admin User</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Target Details</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-semibold text-xs">
                    {activityLogs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-6 text-center text-slate-500 font-sans">No admin actions logged yet</td>
                      </tr>
                    ) : (
                      activityLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 text-white font-bold">{log.admin_name || 'Owner Admin'}</td>
                          <td className="p-3 uppercase text-[10px] text-emerald-400">{log.role || 'OWNER'}</td>
                          <td className="p-3 font-mono text-indigo-300">{log.action}</td>
                          <td className="p-3 text-slate-400">{log.details}</td>
                          <td className="p-3 font-mono text-slate-500">{log.ip_address || '::1'}</td>
                          <td className="p-3 text-right text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Price Override Modal */}
      {priceOverride.show && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-white">
            <h3 className="text-lg font-black tracking-tight mb-2">Override Slot Base Price</h3>
            <p className="text-xs text-slate-400 font-semibold mb-4">Slot: {priceOverride.slotLabel}</p>

            <form onSubmit={submitPriceOverride} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">New Base Price (₹)</label>
                <input 
                  type="number"
                  value={priceOverride.newPrice}
                  onChange={(e) => setPriceOverride({ ...priceOverride, newPrice: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-black text-emerald-400 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setPriceOverride({ show: false, slotId: null, slotLabel: '', currentPrice: 0, newPrice: '' })}
                  className="flex-1 bg-slate-800 text-xs font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-500 text-slate-950 font-black text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Save Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Price Modal */}
      {bulkPriceModal.show && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-white">
            <h3 className="text-lg font-black tracking-tight mb-2">Bulk Edit Slot Prices</h3>
            <p className="text-xs text-slate-400 font-semibold mb-4">Apply new price to {selectedSlotIDs.length} selected slots</p>

            <form onSubmit={handleBulkPriceSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">New Price (₹)</label>
                <input 
                  type="number"
                  value={bulkPriceModal.newPrice}
                  onChange={(e) => setBulkPriceModal({ ...bulkPriceModal, newPrice: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-black text-emerald-400 outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setBulkPriceModal({ show: false, newPrice: '800' })}
                  className="flex-1 bg-slate-800 text-xs font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-500 text-slate-950 font-black text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Update Slots
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Generate Slots Modal */}
      {bulkGenModal.show && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white">
            <h3 className="text-lg font-black tracking-tight mb-2">Bulk Multi-Date Slot Generation</h3>
            <p className="text-xs text-slate-400 font-semibold mb-4">Automatically generate hourly slots across date ranges</p>

            <form onSubmit={handleBulkGenSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Select Turf</label>
                <select 
                  value={bulkGenModal.turfId}
                  onChange={(e) => setBulkGenModal({ ...bulkGenModal, turfId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none"
                >
                  <option value="1">Turf #1 (Bovox Arena A)</option>
                  <option value="2">Turf #2 (Bovox Arena B)</option>
                  <option value="3">Turf #3 (Bovox Arena C)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Start Date</label>
                  <input 
                    type="date"
                    value={bulkGenModal.startDate}
                    onChange={(e) => setBulkGenModal({ ...bulkGenModal, startDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-bold text-white outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">End Date</label>
                  <input 
                    type="date"
                    value={bulkGenModal.endDate}
                    onChange={(e) => setBulkGenModal({ ...bulkGenModal, endDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-bold text-white outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 block mb-1">Base Price Per Slot (₹)</label>
                <input 
                  type="number"
                  value={bulkGenModal.basePrice}
                  onChange={(e) => setBulkGenModal({ ...bulkGenModal, basePrice: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white outline-none"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setBulkGenModal({ ...bulkGenModal, show: false })}
                  className="flex-1 bg-slate-800 text-xs font-bold py-2.5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-500 text-slate-950 font-black text-xs py-2.5 rounded-xl cursor-pointer"
                >
                  Generate Slots
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
