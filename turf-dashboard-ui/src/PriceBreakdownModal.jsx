import React, { useState } from 'react';

export default function PriceBreakdownModal({ slot, apiBase, onClose, onProceedToCheckout, triggerAlert }) {
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const breakdown = slot?.price_breakdown || {
    base_price: slot?.original_price || slot?.base_price || 500,
    final_price: slot?.base_price || 500,
    applied_rules: [],
    demand_indicator: slot?.pricing_tag || 'NORMAL',
    occupancy_percent: 50,
    min_price_floor: 250,
    max_price_ceiling: 1500
  };

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    try {
      setApplyingCoupon(true);
      const res = await fetch(`${apiBase}/api/v1/coupons/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode,
          slot_id: slot.id,
          original_amount: breakdown.final_price
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply coupon');

      setCouponDiscount(data.discount_amount);
      setAppliedCoupon(data.coupon_code);
      triggerAlert(`Coupon '${data.coupon_code}' applied! Saved ₹${data.discount_amount}`, false);
    } catch (err) {
      triggerAlert(err.message, true);
    } finally {
      setApplyingCoupon(false);
    }
  };

  const finalAmount = Math.max(0, breakdown.final_price - couponDiscount);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="mb-6 border-b border-slate-800 pb-4">
          <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full mb-2 tracking-wider">
            <span>🏷️</span> Yield Fare Breakdown
          </div>
          <h2 className="text-xl font-black tracking-tight text-white uppercase">Dynamic Fare Breakdown</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1">
            Slot timing: {slot?.start_time} - {slot?.end_time} ({slot?.date})
          </p>
        </div>

        {/* Demand Indicator Badge */}
        <div className="mb-6 flex justify-between items-center bg-slate-850 border border-slate-800 p-4 rounded-2xl">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Demand Tier</span>
            <span className="text-sm font-black text-white">
              {breakdown.demand_indicator === 'SURGE' ? '🔥 HIGH DEMAND SURGE' :
               breakdown.demand_indicator === 'FLASH_SALE' ? '⚡ OFF-PEAK FLASH SALE' : '🟢 NORMAL DEMAND'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Occupancy Probability</span>
            <span className="text-xs font-black text-emerald-400">{breakdown.occupancy_percent || 50}%</span>
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-3 mb-6 bg-slate-950/60 p-4 rounded-2xl border border-slate-850 text-xs">
          <div className="flex justify-between font-bold text-slate-400">
            <span>Base Turf Price:</span>
            <span>₹{breakdown.base_price}</span>
          </div>

          {/* Applied Rules */}
          {breakdown.applied_rules?.map((rule, idx) => (
            <div key={idx} className="flex justify-between font-bold text-slate-300">
              <span className="flex items-center gap-1">
                <span className="text-emerald-400">•</span> {rule.rule_name}
              </span>
              <span className={rule.multiplier >= 1.0 ? 'text-amber-400 font-black' : 'text-emerald-400 font-black'}>
                {rule.multiplier >= 1.0 ? `+${Math.round((rule.multiplier - 1) * 100)}%` : `-${Math.round((1 - rule.multiplier) * 100)}%`}
              </span>
            </div>
          ))}

          {/* Bounds */}
          <div className="pt-2 border-t border-slate-800/80 flex justify-between text-[10px] font-bold text-slate-500">
            <span>Floor Safeguard: ₹{breakdown.min_price_floor}</span>
            <span>Ceiling Safeguard: ₹{breakdown.max_price_ceiling}</span>
          </div>

          {appliedCoupon && (
            <div className="flex justify-between font-black text-emerald-400 pt-2 border-t border-slate-800">
              <span>Promo Coupon ('{appliedCoupon}'):</span>
              <span>-₹{couponDiscount}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm font-black text-white pt-2 border-t border-slate-800">
            <span>Locked Final Fare:</span>
            <span className="text-lg text-emerald-400">₹{finalAmount}</span>
          </div>
        </div>

        {/* Coupon Input Form */}
        <form onSubmit={handleApplyCoupon} className="mb-6 flex gap-2">
          <input
            type="text"
            placeholder="Enter Coupon Code (e.g. TURF20)"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            className="flex-grow px-3 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-xs font-bold text-white uppercase focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={applyingCoupon}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all"
          >
            {applyingCoupon ? 'Applying...' : 'Apply'}
          </button>
        </form>

        {/* Action Button */}
        <button
          onClick={() => {
            onProceedToCheckout(slot, finalAmount);
            onClose();
          }}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-xs tracking-wider py-3.5 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          🔒 Lock Price & Checkout (₹{finalAmount})
        </button>
      </div>
    </div>
  );
}
