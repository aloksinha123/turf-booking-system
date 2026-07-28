import { fetchApi } from './apiClient';
import { useState, useEffect, useCallback } from 'react';
import StressDashboard from './StressDashboard';
import { useWebSocket } from './useWebSocket';
import ToastContainer from './ToastContainer';

export default function AdminDashboard({ apiBase, triggerAlert, token }) {
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

      if (resAnalytics.status === 401) {
        triggerAlert("Session expired or database reset. Please log in again.", true);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
        return;
      }

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

    // Partial State Mutation: Update specific slot without reloading whole page
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

    // Refresh overall analytics on major events
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
      const response = await fetchApi(`${apiBase}/admin/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ slot_id: slotId })
      });
      if (response.ok) {
        triggerAlert("Slot lock status updated!", false);
        loadAdminData(); // Refresh
      } else {
        triggerAlert("Failed to toggle lock", true);
      }
    } catch (err) {
      triggerAlert("Network error while toggling lock", true);
    }
  };

  // Force Release Slot
  const forceReleaseSlot = async (slotId) => {
    try {
      const response = await fetchApi(`${apiBase}/admin/slots/${slotId}/release`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        triggerAlert("Slot forcefully released!", false);
        loadAdminData();
      } else {
        const data = await response.json();
        triggerAlert(data.error || "Failed to release slot", true);
      }
    } catch (err) {
      triggerAlert("Network error", true);
    }
  };

  // Extend Hold
  const extendSlotHold = async (slotId) => {
    try {
      const response = await fetchApi(`${apiBase}/admin/slots/${slotId}/extend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        triggerAlert("Hold extended by 5 minutes", false);
        loadAdminData();
      } else {
        const data = await response.json();
        triggerAlert(data.error || "Failed to extend hold", true);
      }
    } catch (err) {
      triggerAlert("Network error", true);
    }
  };

  // Apply Multiplier
  const handleApplyMultiplier = async () => {
    setIsApplying(true);
    try {
      const response = await fetchApi(`${apiBase}/admin/multiplier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ multiplier: parseFloat(multiplier) })
      });
      if (response.ok) {
        triggerAlert(`Global multiplier of ${multiplier}x applied successfully!`, false);
        loadAdminData(); // Refresh prices
      } else {
        triggerAlert("Failed to update multiplier", true);
      }
    } catch (err) {
      triggerAlert("Network error while updating multiplier", true);
    } finally {
      setIsApplying(false);
    }
  };

  // Generate Daily Slots
  const handleGenerateSlots = async () => {
    setIsGenerating(true);
    try {
      const response = await fetchApi(`${apiBase}/admin/slots/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ turf_id: 1, date: selectedDate })
      });
      if (response.ok) {
        triggerAlert("Daily inventory generated successfully!", false);
        loadAdminData();
      } else {
        triggerAlert("Failed to generate slots", true);
      }
    } catch (err) {
      triggerAlert("Network error", true);
    } finally {
      setIsGenerating(false);
    }
  };

  // Seed Demo Analytics (for presentations)
  const seedDemoAnalytics = async () => {
    setIsSeeding(true);
    try {
      // Seed by generating slots, dummy bookings, and applying a surge multiplier
      await fetchApi(`${apiBase}/admin/seed_demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      setMultiplier(1.4);
      triggerAlert("Demo data seeded: Slots & Historic Bookings generated!", false);
      loadAdminData();
    } catch (err) {
      triggerAlert("Failed to seed demo data", true);
    } finally {
      setIsSeeding(false);
    }
  };

  // Manual Price Override
  const handlePriceOverride = async () => {
    if (!priceOverride.newPrice || isNaN(priceOverride.newPrice)) {
      triggerAlert("Please enter a valid price", true);
      return;
    }
    try {
      const desiredPrice = parseFloat(priceOverride.newPrice);

      const response = await fetchApi(`${apiBase}/admin/slots/${priceOverride.slotId}/price`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ price: desiredPrice })
      });

      if (response.ok) {
        const slotBasePrice = priceOverride.currentPrice;
        const effectiveMultiplier = desiredPrice / slotBasePrice;
        triggerAlert(`Price override applied: Slot #${priceOverride.slotId} → ₹${desiredPrice} (effective ${effectiveMultiplier.toFixed(2)}x)`, false);
        setPriceOverride({ show: false, slotId: null, slotLabel: '', currentPrice: 0, newPrice: '' });
        loadAdminData(); // Refresh slots
      } else {
        triggerAlert("Failed to update slot price", true);
      }
    } catch (err) {
      triggerAlert("Price override failed", true);
    }
  };

  // Helper: derive dynamic pricing badge for a slot
  const getDynamicBadge = (slot) => {
    const effectiveMultiplier = multiplier;
    if (slot.is_locked) return { label: '🔒 LOCKED', color: 'amber' };
    if (effectiveMultiplier >= 1.3) return { label: `🔥 ${effectiveMultiplier}x SURGE`, color: 'orange' };
    if (effectiveMultiplier <= 0.75) return { label: `⚡ ${((1 - effectiveMultiplier) * 100).toFixed(0)}% FLASH SALE`, color: 'emerald' };
    if (effectiveMultiplier > 1.0) return { label: `${effectiveMultiplier}x PEAK`, color: 'purple' };
    if (effectiveMultiplier < 1.0) return { label: `${effectiveMultiplier}x DISCOUNT`, color: 'cyan' };
    return { label: '1.0x BASE', color: 'slate' };
  };


  const bookedSlots = slots.filter(s => s.is_booked).length;
  const totalSlots = slots.length;
  const occupancyRate = totalSlots > 0 ? ((bookedSlots / totalSlots) * 100).toFixed(1) : 0;
  const commission = (analytics.total_revenue * 0.05).toFixed(0);

  // Turf status derived from slots
  const getTurfLiveStatus = (turfId) => {
    const turfSlots = slots.filter(s => s.turf_id === turfId);
    const lockedSlot = turfSlots.find(s => s.is_locked);
    if (lockedSlot) return { status: 'maintenance', label: 'Maintenance Lock', color: 'amber' };

    const now = new Date();
    const currentHour = now.getHours();
    const activeSlot = turfSlots.find(s => {
      const startH = parseInt(s.start_time?.split(':')[0] || 0);
      const endH = parseInt(s.end_time?.split(':')[0] || 0);
      return s.is_booked && startH <= currentHour && endH > currentHour;
    });
    if (activeSlot) return { status: 'occupied', label: 'Match in Progress', color: 'rose' };

    const availableCount = turfSlots.filter(s => !s.is_booked && !s.is_locked).length;
    if (availableCount > 0) return { status: 'available', label: `${availableCount} Slots Open`, color: 'emerald' };
    return { status: 'full', label: 'Fully Booked', color: 'purple' };
  };

  // Simulated hourly booking data for the area chart visualization
  const chartHours = ['06', '08', '10', '12', '14', '16', '18', '20', '22'];
  const chartData = analytics.hourly_volume && analytics.hourly_volume.length > 0 ? analytics.hourly_volume : [0, 0, 0, 0, 0, 0, 0, 0, 0];

  // Dynamic stats
  const maxVolume = Math.max(...chartData, 0);
  const peakHourIndex = chartData.indexOf(maxVolume);
  const peakHourStr = maxVolume > 0 ? `${chartHours[peakHourIndex]}:00 - ${parseInt(chartHours[peakHourIndex]) + 2}:00` : '--:--';
  const avgVolume = Math.round(chartData.reduce((a, b) => a + b, 0) / chartData.length);
  const revenuePeak = maxVolume > 0 ? `₹${(maxVolume * 1000).toLocaleString('en-IN')}` : '₹0';

  return (
    <div className="bg-slate-50 min-h-screen font-sans relative">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Dark Header Section */}
      <div className="bg-slate-900 pt-8 pb-32 px-6 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none"></div>
        
        <div className="max-w-[1440px] mx-auto relative z-10">
          {/* Dashboard Header Row */}
          <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center border-b border-slate-800 pb-5 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-6 rounded-full bg-emerald-500 inline-block shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase">
                  Admin Command Center
                </h2>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ml-2">
                  Role: OWNER
                </span>
              </div>
              <p className="text-xs text-slate-400 font-semibold">Enterprise Multi-Turf Command Center & Yield Control Platform</p>
            </div>

            {/* System Telemetry & Quick Control Tools */}
            <div className="flex flex-wrap items-center gap-3">
              {/* WS Connection Status Pill */}
              <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-3 py-2 rounded-xl text-xs font-bold text-slate-300">
                {wsStatus === 'connected' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-emerald-400">🟢 Connected</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-indigo-300 font-mono text-[10px]">Seq #{lastSeqId || 0}</span>
                    <span className="text-slate-600">|</span>
                    <span>👥 {onlineCount} Online</span>
                  </>
                ) : wsStatus === 'reconnecting' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    <span className="text-amber-300">🟡 Reconnecting...</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    <span className="text-rose-400">🔴 Polling Fallback (5s)</span>
                  </>
                )}
              </div>

              {/* CSV Export Button */}
              <button
                onClick={handleExportBookingsCSV}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                📥 Export Bookings CSV
              </button>

              {/* Maintenance Mode Toggle Button */}
              <button
                onClick={handleToggleMaintenance}
                className={`font-black text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5 border ${
                  maintenanceMode.is_maintenance
                    ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white animate-pulse'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
                }`}
              >
                {maintenanceMode.is_maintenance ? '🚫 MAINTENANCE ACTIVE (Disable)' : '🔧 Enable Maintenance Mode'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area (Light) */}
      <div className="max-w-[1440px] mx-auto px-6 -mt-24 relative z-20">

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MULTI-RANGE REVENUE & BOOKING FILTER TOOLBAR            */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 mb-6 shadow-2xl flex flex-wrap items-center justify-between gap-4 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase text-slate-400 mr-2">📅 Revenue Range:</span>
            {['today', 'weekly', 'monthly', 'yearly', 'custom'].map((r) => (
              <button
                key={r}
                onClick={() => setAnalyticsRange(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border ${
                  analyticsRange === r
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'weekly' ? '7 Days' : r === 'monthly' ? '30 Days' : r === 'yearly' ? '1 Year' : 'Custom Range'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {analyticsRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold text-white focus:outline-none"
                />
                <span className="text-slate-500 font-bold text-xs">to</span>
                <input
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-xs font-bold text-white focus:outline-none"
                />
              </div>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending Hold</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        {/* 🧠 AI Occupancy Insights Banner */}
        {v2Analytics?.ai_insights?.length > 0 && (
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border border-indigo-500/30 rounded-3xl p-5 mb-6 text-white shadow-xl flex items-start gap-4">
            <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center font-black text-xl flex-shrink-0 border border-indigo-500/30">
              🧠
            </div>
            <div className="flex-grow">
              <span className="text-[10px] font-black uppercase text-indigo-300 tracking-widest bg-indigo-500/20 px-2 py-0.5 rounded">
                AI Automated Occupancy & Revenue Insights
              </span>
              <div className="mt-2 space-y-1 text-xs font-bold text-slate-200">
                {v2Analytics.ai_insights.map((insight, idx) => (
                  <p key={idx}>{insight}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TOP KPI CARDS GRID (4 Columns)                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">

          {/* KPI 1: Gross Platform Revenue */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 relative overflow-hidden group hover:border-slate-300 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-bl-full"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Gross Platform Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
            </div>
            <h3 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight break-all">
              ₹{analytics.total_revenue?.toLocaleString('en-IN') || '0'}
            </h3>
            <div className="mt-3 inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md text-[10px] font-black border border-emerald-500/20 uppercase tracking-wider whitespace-nowrap">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
              +18% vs last week
            </div>
          </div>

          {/* KPI 2: Total Occupancy Rate */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 relative overflow-hidden group hover:border-slate-300 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-bl-full"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Occupancy Rate</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
              </div>
            </div>
            <h3 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight break-all">
              {occupancyRate}%
            </h3>
            <div className="mt-3 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(occupancyRate, 100)}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-slate-500 font-bold mt-2">{bookedSlots} / {totalSlots} slots filled</p>
          </div>

          {/* KPI 3: Active Bookings Today */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 relative overflow-hidden group hover:border-slate-300 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/5 to-transparent rounded-bl-full"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Active Bookings Today</span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
              </div>
            </div>
            <h3 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight break-all">
              {analytics.active_bookings || bookedSlots}
            </h3>
            <div className="mt-3 inline-flex items-center gap-1.5 bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-md text-[10px] font-black border border-purple-500/20 uppercase tracking-wider whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"></span> Across all turfs
            </div>
          </div>

          {/* KPI 4: Platform Commission (5%) */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 relative overflow-hidden group hover:border-slate-300 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/5 to-transparent rounded-bl-full"></div>
            <div className="flex justify-between items-start mb-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Platform Commission (5%)</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
              </div>
            </div>
            <h3 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight break-all">
              ₹{parseInt(commission).toLocaleString('en-IN')}
            </h3>
            <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-md text-[10px] font-black border border-amber-500/20 uppercase tracking-wider whitespace-nowrap">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7l4-4m0 0l4 4m-4-4v18" /></svg>
              Net after deductions
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MAIN ANALYTICS SECTION (Chart + Live Status)           */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">

          {/* LEFT: Area Chart Placeholder (2/3 width) */}
          <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-2xl p-6 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block"></span>
                  Hourly Booking Volume & Revenue
                </h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Weekly aggregate view</p>
              </div>
              <div className="flex gap-4 text-[10px] font-black uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-cyan-400"><span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span> Bookings</span>
                <span className="flex items-center gap-1.5 text-purple-400"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block"></span> Revenue</span>
              </div>
            </div>

            {/* SVG Area Chart Visualization */}
            <div className="relative h-52">
              <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
                {/* Grid lines */}
                {[0, 50, 100, 150].map(y => (
                  <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
                ))}

                {/* Area gradient fill */}
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Cyan area (Bookings) */}
                <path
                  d={`M0,${200 - chartData[0] * 2} ${chartData.map((v, i) => `L${i * 100},${200 - v * 2}`).join(' ')} L800,${200 - chartData[chartData.length - 1] * 2} L800,200 L0,200 Z`}
                  fill="url(#areaGrad)"
                />
                <polyline
                  points={chartData.map((v, i) => `${i * 100},${200 - v * 2}`).join(' ')}
                  fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                />

                {/* Purple area (Revenue - slightly offset) */}
                <path
                  d={`M0,${200 - chartData[0] * 1.6} ${chartData.map((v, i) => `L${i * 100},${200 - v * 1.6}`).join(' ')} L800,${200 - chartData[chartData.length - 1] * 1.6} L800,200 L0,200 Z`}
                  fill="url(#areaGrad2)"
                />
                <polyline
                  points={chartData.map((v, i) => `${i * 100},${200 - v * 1.6}`).join(' ')}
                  fill="none" stroke="#a855f7" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 3"
                />

                {/* Data dots */}
                {chartData.map((v, i) => (
                  <circle key={i} cx={i * 100} cy={200 - v * 2} r="4" fill="#06b6d4" stroke="#0f172a" strokeWidth="2" />
                ))}
              </svg>

              {/* X-axis labels */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
                {chartHours.map(h => (
                  <span key={h} className="text-[9px] text-slate-600 font-bold">{h}:00</span>
                ))}
              </div>
            </div>

            {/* Peak indicator */}
            <div className="mt-4 flex gap-4 border-t border-slate-200 pt-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex-1">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Peak Hour</span>
                <span className="text-sm font-black text-cyan-500">{peakHourStr}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex-1">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Avg Volume</span>
                <span className="text-sm font-black text-purple-500">{avgVolume} bookings/hr</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex-1">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Revenue Peak</span>
                <span className="text-sm font-black text-emerald-500">{revenuePeak}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Live Turf Status Matrix (1/3 width) */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
              Live Turf Status Matrix
            </h3>
            <p className="text-[10px] text-slate-500 font-semibold mb-5">Instant toggle & monitoring</p>

            <div className="space-y-4">
              {/* Turf A */}
              {[
                { id: 1, name: 'Turf A', sport: 'Football', venue: 'Bovox Arena' },
                { id: 2, name: 'Turf B', sport: 'Cricket', venue: 'Godrej Sky Turf' },
                { id: 3, name: 'Turf C', sport: 'Badminton', venue: 'Neon Court' }
              ].map(turf => {
                const live = getTurfLiveStatus(turf.id);
                const colorMap = {
                  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
                  rose: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', dot: 'bg-rose-500' },
                  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
                  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', dot: 'bg-purple-500' },
                };
                const c = colorMap[live.color] || colorMap.emerald;

                return (
                  <div key={turf.id} className={`${c.bg} border ${c.border} rounded-xl p-4 transition-all`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">{turf.name} ({turf.sport})</h4>
                        <p className="text-[9px] text-slate-500 font-bold">{turf.venue}</p>
                      </div>
                      <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider ${c.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${live.status === 'occupied' ? 'animate-pulse' : ''}`}></span>
                        {live.label}
                      </span>
                    </div>

                    {/* Mini slot stats */}
                    <div className="flex gap-2 mt-3">
                      <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 text-center">
                        <span className="text-[8px] text-slate-500 font-black uppercase block">Booked</span>
                        <span className="text-xs font-black text-slate-900">{slots.filter(s => s.turf_id === turf.id && s.is_booked).length}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 text-center">
                        <span className="text-[8px] text-slate-500 font-black uppercase block">Open</span>
                        <span className="text-xs font-black text-emerald-500">{slots.filter(s => s.turf_id === turf.id && !s.is_booked && !s.is_locked).length}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 text-center">
                        <span className="text-[8px] text-slate-500 font-black uppercase block">Locked</span>
                        <span className="text-xs font-black text-amber-500">{slots.filter(s => s.turf_id === turf.id && s.is_locked).length}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* INVENTORY & BUSINESS CONTROLS                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden mb-8">

          {/* Section Header */}
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block"></span>
                Inventory & Business Controls
              </h3>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{slots.length} slots loaded for {selectedDate} · Multiplier: {multiplier}x</p>
            </div>
          </div>

          {/* ─── QUICK ACTIONS TOOLBAR ─── */}
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="flex flex-wrap items-center gap-3">

              {/* ⚡ Generate Today's Slots */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider whitespace-nowrap">📅 Date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-slate-900 text-[11px] font-bold outline-none cursor-pointer w-32"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <button
                  onClick={handleGenerateSlots}
                  disabled={isGenerating}
                  className="bg-emerald-500 hover:bg-emerald-400 text-white font-black text-[9px] uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-sm"
                >
                  {isGenerating ? '...' : '⚡ Generate Today (10AM–10PM)'}
                </button>
                <button
                  onClick={() => setBulkGenModal({ ...bulkGenModal, show: true })}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all active:scale-95 cursor-pointer whitespace-nowrap shadow-sm"
                >
                  🗓️ Multi-Date Bulk Generate
                </button>
              </div>

              {/* Bulk Edit & Lock Actions */}
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-1.5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Bulk ({selectedSlotIDs.length}):</span>
                <button
                  onClick={() => setBulkPriceModal({ ...bulkPriceModal, show: true })}
                  disabled={selectedSlotIDs.length === 0}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-black text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-md transition-all disabled:opacity-40 cursor-pointer"
                >
                  ✏️ Edit Price
                </button>
                <button
                  onClick={() => handleBulkLockToggle(true)}
                  disabled={selectedSlotIDs.length === 0}
                  className="bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 font-black text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-md transition-all disabled:opacity-40 cursor-pointer"
                >
                  🔒 Freeze
                </button>
                <button
                  onClick={() => handleBulkLockToggle(false)}
                  disabled={selectedSlotIDs.length === 0}
                  className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 font-black text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-md transition-all disabled:opacity-40 cursor-pointer"
                >
                  🟢 Unfreeze
                </button>
              </div>

              {/* 🌐 Global Surge Multiplier */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider whitespace-nowrap">🌐 Surge:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="3.0"
                  value={multiplier}
                  onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                  className="bg-slate-50 border border-slate-200 text-slate-900 text-sm font-black rounded-lg p-1.5 outline-none text-center w-16 focus:border-purple-500/50 transition-colors"
                />
                <button
                  onClick={handleApplyMultiplier}
                  disabled={isApplying}
                  className="bg-purple-500 hover:bg-purple-400 text-white font-black text-[9px] uppercase tracking-wider py-1.5 px-3 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isApplying ? '...' : `Apply ${multiplier > 1 ? `${((multiplier - 1) * 100).toFixed(0)}% Surge` : multiplier < 1 ? `${((1 - multiplier) * 100).toFixed(0)}% Discount` : '1x Base'}`}
                </button>
              </div>

              {/* Visual Multiplier Scale Bar */}
              <div className="hidden lg:flex items-center gap-2 flex-1 min-w-[140px]">
                <span className="text-[8px] font-black text-cyan-500">0.5x</span>
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full relative overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(((multiplier - 0.5) / 2.5) * 100, 100)}%`,
                      background: multiplier > 1.5 ? 'linear-gradient(to right, #f59e0b, #ef4444)' : multiplier < 1.0 ? 'linear-gradient(to right, #3b82f6, #06b6d4)' : 'linear-gradient(to right, #10b981, #14b8a6)'
                    }}
                  ></div>
                </div>
                <span className="text-[8px] font-black text-rose-500">3.0x</span>
              </div>

              {/* 🌱 Seed Demo Analytics */}
              <button
                onClick={seedDemoAnalytics}
                disabled={isSeeding}
                className="ml-auto bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-300 text-slate-500 hover:text-emerald-600 text-[9px] font-black uppercase tracking-wider py-2 px-3 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-sm"
              >
                {isSeeding ? '🌱 Seeding...' : '🌱 Seed Demo'}
              </button>
            </div>
          </div>

          {/* ─── ENHANCED SLOT MANAGEMENT TABLE ─── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[9px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                  <th scope="col" className="px-4 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={slots.length > 0 && selectedSlotIDs.length === slots.length}
                      className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3">Slot ID</th>
                  <th scope="col" className="px-4 py-3">Timing</th>
                  <th scope="col" className="px-4 py-3">Turf Name</th>
                  <th scope="col" className="px-4 py-3">Base Price</th>
                  <th scope="col" className="px-4 py-3">Dynamic Multiplier</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-600">
                        <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        <span className="text-[10px] font-black uppercase tracking-wider">No slots generated</span>
                        <span className="text-[9px] font-semibold">Click "⚡ Generate Slots" above to create inventory</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  slots.map((slot) => {
                    const badge = getDynamicBadge(slot);
                    const badgeColors = {
                      orange: 'bg-orange-50 text-orange-600 border-orange-200',
                      emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
                      purple: 'bg-purple-50 text-purple-600 border-purple-200',
                      cyan: 'bg-cyan-50 text-cyan-600 border-cyan-200',
                      amber: 'bg-amber-50 text-amber-600 border-amber-200',
                      slate: 'bg-slate-100 text-slate-600 border-slate-200',
                    };
                    const dynamicPrice = (slot.base_price * multiplier).toFixed(0);

                    return (
                      <tr key={slot.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors group">
                        {/* Selection Checkbox */}
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedSlotIDs.includes(slot.id)}
                            onChange={() => handleToggleSlotSelect(slot.id)}
                            className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                          />
                        </td>

                        {/* Slot ID */}
                        <td className="px-4 py-3.5 font-black text-slate-900 text-xs whitespace-nowrap">
                          <span className="text-slate-600">#</span>{String(slot.id).padStart(3, '0')}
                        </td>

                        {/* Timing */}
                        <td className="px-4 py-3.5">
                          <span className="bg-slate-100 text-slate-600 py-1 px-2 rounded-md font-mono font-bold text-[10px] border border-slate-200">
                            {slot.start_time} — {slot.end_time}
                          </span>
                        </td>

                        {/* Turf Name */}
                        <td className="px-4 py-3.5 text-xs text-slate-500 font-semibold">
                          {slot.turf?.name || "Unknown Turf"}
                        </td>

                        {/* Base Price + Dynamic */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {multiplier !== 1.0 ? (
                              <>
                                <span className="text-slate-400 line-through text-[10px] font-bold">₹{Math.round(slot.base_price)}</span>
                                <span className="text-emerald-600 font-black text-xs">₹{Math.round(dynamicPrice)}</span>
                              </>
                            ) : (
                              <span className="text-emerald-600 font-black text-xs">₹{Math.round(slot.base_price)}</span>
                            )}
                          </div>
                        </td>

                        {/* Dynamic Multiplier Badge */}
                        <td className="px-4 py-3.5">
                          <span className={`${badgeColors[badge.color] || badgeColors.slate} border font-black px-2 py-0.5 rounded text-[9px] uppercase tracking-wider inline-flex items-center gap-1`}>
                            {badge.label}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          {slot.is_locked ? (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black px-2 py-0.5 rounded text-[9px] uppercase tracking-wider inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Maintenance
                            </span>
                          ) : slot.is_booked ? (
                            <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 font-black px-2 py-0.5 rounded text-[9px] uppercase tracking-wider inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                              Booked
                            </span>
                          ) : slot.hold_expires_at && new Date(slot.hold_expires_at) > new Date() ? (
                            <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-black px-2 py-0.5 rounded text-[9px] uppercase tracking-wider inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                              Pending Hold
                            </span>
                          ) : (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black px-2 py-0.5 rounded text-[9px] uppercase tracking-wider inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Available
                            </span>
                          )}
                        </td>

                        {/* Actions: Emergency Lock + Price Override */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-3">
                            {/* Manual Price Override */}
                            <button
                              onClick={() => setPriceOverride({
                                show: true,
                                slotId: slot.id,
                                slotLabel: `${slot.start_time}–${slot.end_time}`,
                                currentPrice: slot.base_price,
                                newPrice: ''
                              })}
                              className="text-slate-600 hover:text-cyan-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                              title="Manual Price Override"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                            </button>

                            {/* Admin Controls for Pending Hold */}
                            {slot.hold_expires_at && new Date(slot.hold_expires_at) > new Date() && !slot.is_booked && (
                              <>
                                <button
                                  onClick={() => extendSlotHold(slot.id)}
                                  className="text-xs font-bold bg-slate-800 text-slate-300 hover:text-white px-2 py-1 rounded transition-colors"
                                  title="Extend Hold by 5 minutes"
                                >
                                  +5M
                                </button>
                                <button
                                  onClick={() => forceReleaseSlot(slot.id)}
                                  className="text-xs font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 px-2 py-1 rounded transition-colors"
                                  title="Force Release Slot"
                                >
                                  ❌
                                </button>
                              </>
                            )}

                            {/* Emergency Freeze/Lock Toggle */}
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => toggleLock(slot.id)}
                                className={`relative inline-flex items-center h-5 rounded-full w-10 transition-colors focus:outline-none cursor-pointer ${slot.is_locked ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]' : 'bg-emerald-500'
                                  }`}
                              >
                                <span
                                  className={`inline-block w-3.5 h-3.5 transform bg-white rounded-full transition-transform shadow-sm ${slot.is_locked ? 'translate-x-5.5' : 'translate-x-0.5'
                                    }`}
                                />
                              </button>
                              <span className={`text-[7px] uppercase font-black tracking-widest ${slot.is_locked ? 'text-rose-400' : 'text-emerald-400/60'}`}>
                                {slot.is_locked ? '🔒 Frozen' : 'Active'}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Stats */}
          {slots.length > 0 && (
            <div className="p-4 border-t border-[#1e293b] bg-[#0b0f19] flex flex-wrap items-center gap-4 text-[9px] font-black uppercase tracking-wider text-slate-500">
              <span>Total: {slots.length}</span>
              <span className="text-emerald-400/70">Available: {slots.filter(s => !s.is_booked && !s.is_locked).length}</span>
              <span className="text-purple-400/70">Booked: {slots.filter(s => s.is_booked).length}</span>
              <span className="text-amber-400/70">Locked: {slots.filter(s => s.is_locked).length}</span>
              <span className="ml-auto text-slate-600">Effective Rate: {multiplier}x</span>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PRICE OVERRIDE MODAL                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {priceOverride.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPriceOverride({ ...priceOverride, show: false })}>
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Manual Price Override</h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Slot #{priceOverride.slotId} · {priceOverride.slotLabel}</p>
                </div>
                <button onClick={() => setPriceOverride({ ...priceOverride, show: false })} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Current Price */}
                <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Current Base Price</span>
                  <span className="text-lg font-black text-slate-400">₹{Math.round(priceOverride.currentPrice)}</span>
                </div>

                {/* New Price Input */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">New Override Price (₹)</label>
                  <input
                    type="number"
                    value={priceOverride.newPrice}
                    onChange={(e) => setPriceOverride({ ...priceOverride, newPrice: e.target.value })}
                    placeholder="e.g. 1400"
                    className="w-full bg-[#111827] border border-[#1e293b] text-white text-xl font-black rounded-xl focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 block p-4 outline-none transition-all text-center placeholder:text-slate-700"
                    autoFocus
                  />
                </div>

                {/* Effective Multiplier Preview */}
                {priceOverride.newPrice && !isNaN(priceOverride.newPrice) && (
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3 flex justify-between items-center">
                    <span className="text-[10px] font-black text-cyan-400/70 uppercase tracking-wider">Effective Multiplier</span>
                    <span className="text-sm font-black text-cyan-400">{(parseFloat(priceOverride.newPrice) / priceOverride.currentPrice).toFixed(2)}x</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setPriceOverride({ ...priceOverride, show: false })}
                    className="flex-1 bg-[#111827] hover:bg-[#1e293b] border border-[#1e293b] text-slate-400 font-black text-[10px] uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePriceOverride}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-[#080c14] font-black text-[10px] uppercase tracking-wider py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-cyan-500/10 cursor-pointer"
                  >
                    Apply Override
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 🏷️ Airline/Hotel Yield Pricing Engine & Coupon Manager */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dynamic Pricing Rules Manager */}
          <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span>🏷️</span> Yield Pricing Rules Engine
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Hierarchy: Priority #100 &gt; #50 &gt; #10</p>
              </div>
              {yieldAnalytics && (
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Dynamic Revenue Uplift</span>
                  <span className="text-sm font-black text-emerald-400">+₹{yieldAnalytics.revenue_uplift?.toFixed(0)}</span>
                </div>
              )}
            </div>

            {/* Create Rule Form */}
            <form onSubmit={handleCreateRule} className="grid grid-cols-2 gap-3 mb-6 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Diwali Holiday Surge"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Type</label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="holiday">🎉 Holiday / Event</option>
                  <option value="early_bird">🐦 Early Bird Discount</option>
                  <option value="last_minute">⚡ Last Minute Discount</option>
                  <option value="surge">🔥 Demand Surge</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Multiplier (e.g. 1.25x)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.2"
                  max="5.0"
                  value={ruleMultiplier}
                  onChange={(e) => setRuleMultiplier(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Priority (#)</label>
                <input
                  type="number"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="col-span-2">
                <button
                  type="submit"
                  disabled={submittingRule}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs tracking-wider py-2.5 rounded-xl cursor-pointer shadow-md"
                >
                  {submittingRule ? 'Adding...' : '➕ Add Priority Pricing Rule'}
                </button>
              </div>
            </form>

            {/* Rules List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {pricingRules.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4 font-semibold">No custom pricing rules. Built-in Yield Engine active.</p>
              ) : (
                pricingRules.map((rule) => (
                  <div key={rule.id} className="flex justify-between items-center bg-slate-900 border border-slate-800 p-3 rounded-xl text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{rule.name}</span>
                        <span className="text-[9px] font-black bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded uppercase">
                          Priority #{rule.priority}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">{rule.rule_type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-amber-400 text-sm">{rule.multiplier}x</span>
                      <button
                        onClick={() => handleToggleRule(rule.id)}
                        className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg cursor-pointer ${
                          rule.is_active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {rule.is_active ? 'Active' : 'Off'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Promotional Coupons Manager */}
          <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span>🎟️</span> Promotional Coupon Engine
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Coupons & Surge compatibility safeguards</p>
            </div>

            {/* Create Coupon Form */}
            <form onSubmit={handleCreateCoupon} className="grid grid-cols-2 gap-3 mb-6 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Coupon Code</label>
                <input
                  type="text"
                  placeholder="e.g. TURF20"
                  value={couponCodeInput}
                  onChange={(e) => setCouponCodeInput(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Discount (%)</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={couponValInput}
                  onChange={(e) => setCouponValInput(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="col-span-2 flex items-center justify-between bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300">Allow Usage During Surge Pricing?</span>
                <input
                  type="checkbox"
                  checked={couponAllowSurge}
                  onChange={(e) => setCouponAllowSurge(e.target.checked)}
                  className="w-4 h-4 text-emerald-500 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="col-span-2">
                <button
                  type="submit"
                  disabled={submittingCoupon}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-xs tracking-wider py-2.5 rounded-xl cursor-pointer shadow-md"
                >
                  {submittingCoupon ? 'Creating...' : '🎟️ Create Coupon Code'}
                </button>
              </div>
            </form>

            {/* Coupons List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {coupons.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4 font-semibold">No active coupons created yet.</p>
              ) : (
                coupons.map((c) => (
                  <div key={c.id} className="flex justify-between items-center bg-slate-900 border border-slate-800 p-3 rounded-xl text-xs">
                    <div>
                      <span className="font-black text-white uppercase">{c.code}</span>
                      <span className="ml-2 text-[10px] font-bold text-emerald-400">-{c.discount_value}% OFF</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {c.allow_with_surge ? '✅ Surge Allowed' : '⛔ Surge Blocked'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 📋 Admin Activity Security Audit Trail */}
        <div className="mt-8 bg-[#0e1422] border border-slate-800 rounded-3xl p-6 shadow-xl text-white">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                <span>📋</span> Security Audit & Admin Activity Log
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Real-time audit log of all admin operations</p>
            </div>
            <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-xl uppercase">
              {activityLogs.length} Events Logged
            </span>
          </div>

          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-800 bg-slate-900/60 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Details</th>
                  <th className="py-2.5 px-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-semibold text-slate-300">
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6 text-slate-500 font-semibold">No admin actions recorded yet.</td>
                  </tr>
                ) : (
                  activityLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 whitespace-nowrap text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="py-2 px-3 font-bold text-white">{log.admin_name}</td>
                      <td className="py-2 px-3">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                          {log.admin_role || 'owner'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold text-amber-400">{log.action}</td>
                      <td className="py-2 px-3 text-cyan-300">{log.target_resource}</td>
                      <td className="py-2 px-3 text-slate-400">{log.details}</td>
                      <td className="py-2 px-3 text-slate-500 font-mono text-[10px]">{log.ip_address}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Telemetry & Stress Test Zone */}
        <StressDashboard apiBase={apiBase} token={token} onTestComplete={loadAdminData} />

        {/* ─── BULK PRICE EDIT MODAL ─── */}
        {bulkPriceModal.show && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white">
              <h3 className="text-lg font-black uppercase tracking-tight mb-2">✏️ Bulk Edit Slot Price</h3>
              <p className="text-xs text-slate-400 mb-4">Set base price for selected slots on {selectedDate}</p>

              <form onSubmit={handleBulkPriceSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">New Price (INR)</label>
                  <input
                    type="number"
                    min="100"
                    step="50"
                    value={bulkPriceModal.newPrice}
                    onChange={(e) => setBulkPriceModal({ ...bulkPriceModal, newPrice: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setBulkPriceModal({ ...bulkPriceModal, show: false })}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 font-black text-xs uppercase py-3 rounded-xl transition-all cursor-pointer text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase py-3 rounded-xl transition-all cursor-pointer shadow-md"
                  >
                    Apply Bulk Price
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── BULK MULTI-DATE SLOT GENERATION MODAL ─── */}
        {bulkGenModal.show && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0e1422] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white">
              <h3 className="text-lg font-black uppercase tracking-tight mb-2">🗓️ Bulk Multi-Date Slot Generator</h3>
              <p className="text-xs text-slate-400 mb-4">Generate 10 AM – 10 PM hourly slots across a date range</p>

              <form onSubmit={handleBulkGenSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={bulkGenModal.startDate}
                      onChange={(e) => setBulkGenModal({ ...bulkGenModal, startDate: e.target.value })}
                      required
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={bulkGenModal.endDate}
                      onChange={(e) => setBulkGenModal({ ...bulkGenModal, endDate: e.target.value })}
                      required
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Turf ID</label>
                  <select
                    value={bulkGenModal.turfId}
                    onChange={(e) => setBulkGenModal({ ...bulkGenModal, turfId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none cursor-pointer"
                  >
                    <option value="1">Turf A (Football)</option>
                    <option value="2">Turf B (Cricket)</option>
                    <option value="3">Turf C (Badminton)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Base Price (INR)</label>
                  <input
                    type="number"
                    value={bulkGenModal.basePrice}
                    onChange={(e) => setBulkGenModal({ ...bulkGenModal, basePrice: e.target.value })}
                    required
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setBulkGenModal({ ...bulkGenModal, show: false })}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 font-black text-xs uppercase py-3 rounded-xl transition-all cursor-pointer text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase py-3 rounded-xl transition-all cursor-pointer shadow-md"
                  >
                    Generate Slots
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
