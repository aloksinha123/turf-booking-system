import { fetchApi } from './apiClient';
import React, { useState, useEffect } from 'react';

export default function BookingHistory({ apiBase, token, downloadTicketPDF }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const res = await fetchApi(`${apiBase}/user/bookings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch bookings');
      const data = await res.json();
      setBookings(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (booking) => {
    if (downloadTicketPDF) {
      downloadTicketPDF(booking.id, booking.slot, booking.final_amount, booking.is_split);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 flex justify-center items-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-[#10b981] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-200 inline-block">
          <p className="font-bold">🚨 {error}</p>
          <button onClick={fetchBookings} className="mt-4 text-sm underline font-semibold">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-3">
          <span className="text-[#10b981]">📋</span> My Booking History
        </h2>
        <p className="text-sm font-semibold text-slate-500 mt-2">View all your past and upcoming turf sessions.</p>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-24 bg-white border border-slate-200 rounded-3xl shadow-sm">
          <div className="text-5xl mb-4 opacity-50">🏟️</div>
          <p className="text-lg font-black text-slate-400 uppercase tracking-widest">No Bookings Found</p>
          <p className="text-sm text-slate-500 font-semibold mt-2">You haven't made any turf reservations yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookings.map((booking) => {
            const isConfirmed = booking.status === 'confirmed';
            const isPending = booking.status === 'pending';
            const statusColor = isConfirmed ? 'bg-[#10b981] text-white' : isPending ? 'bg-amber-400 text-amber-950' : 'bg-red-500 text-white';
            const statusText = isConfirmed ? 'Confirmed' : isPending ? 'Pending' : 'Failed/Expired';

            const pitchName = booking.slot?.turf_id === 1 ? '⚽ Turf A (Football)' :
                              booking.slot?.turf_id === 2 ? '🏏 Turf B (Cricket)' : '🏸 Turf C (Badminton)';

            const dateStr = booking.slot?.start_time ? new Date(booking.booked_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';

            return (
              <div key={booking.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col relative group">
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 group-hover:bg-[#10b981] transition-colors"></div>
                <div className="p-6 pb-5 border-b border-slate-100 flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Booking #{String(booking.id).padStart(4, '0')}</span>
                    <h3 className="font-black text-slate-900 text-lg tracking-tight leading-tight">{pitchName}</h3>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md tracking-wider ${statusColor}`}>
                    {statusText}
                  </span>
                </div>
                
                <div className="p-6 flex-grow space-y-4 bg-slate-50/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-semibold">Play Time:</span>
                    <span className="font-bold text-slate-900">{booking.slot?.start_time || '--'} - {booking.slot?.end_time || '--'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-semibold">Booked On:</span>
                    <span className="font-bold text-slate-900">{dateStr}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-semibold">Total Paid:</span>
                    <span className="font-black text-[#10b981] text-base">₹{booking.final_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-4 bg-white flex justify-end gap-3 border-t border-slate-100">
                  {isConfirmed && (
                    <button 
                      onClick={() => handleDownload(booking)}
                      className="text-xs font-black uppercase text-[#10b981] hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-100 flex items-center gap-2"
                    >
                      <span>📥</span> Download Ticket
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
