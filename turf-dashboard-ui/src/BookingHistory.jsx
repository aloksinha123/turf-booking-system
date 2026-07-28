import { fetchApi } from './apiClient';
import React, { useState, useEffect } from 'react';

export default function BookingHistory({ apiBase, token, downloadTicketPDF, triggerAlert }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const handleViewQRTicket = async (bookingId) => {
    try {
      const res = await fetchApi(`${apiBase}/api/v1/tickets/${bookingId}`);
      if (!res.ok) throw new Error('Failed to load digital ticket');
      const data = await res.json();
      setSelectedTicket(data);
    } catch (err) {
      if (triggerAlert) triggerAlert(err.message, true);
    }
  };

  useEffect(() => {
    fetchBookings();

    // Listen for WebSocket updates on split payments
    let wsUrl = apiBase.replace("http", "ws") + "/ws";
    let ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "split_update") {
          // A split payment was updated (paid or declined). Refresh!
          fetchBookings();
        }
      } catch (err) {}
    };

    return () => {
      if (ws) ws.close();
    };
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
      downloadTicketPDF(booking.id, booking.slot, booking.final_amount, booking.is_split, booking.status);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm("Are you sure you want to cancel this booking? If this is a split, any friends who already paid will be instantly refunded.")) return;
    try {
      const res = await fetchApi(`${apiBase}/user/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel booking');
      }
      triggerAlert("Booking cancelled. Refunds processed.", false);
      fetchBookings();
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };

  const handleResendInvite = async (splitId) => {
    try {
      const res = await fetchApi(`${apiBase}/splits/${splitId}/resend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch invite link');
      
      const link = `${window.location.origin}/pay-split?token=${data.token}`;
      await navigator.clipboard.writeText(link);
      triggerAlert("Invite link copied to clipboard!", false);
    } catch (err) {
      triggerAlert(err.message, true);
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
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Booking #{booking.reference_id || String(booking.id).padStart(4, '0')}</span>
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

                {booking.is_split && booking.splits && booking.splits.length > 0 && (
                  <div className="bg-slate-50 border-t border-slate-100 p-4">
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Split Progress</p>
                        <div className="text-sm font-black text-slate-700">
                          {booking.splits.filter(s => s.status === 'paid').length + 1} / {booking.splits.length + 1} Paid
                        </div>
                      </div>
                      {isPending && (
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Expires In</p>
                          <CountdownTimer bookedAt={booking.booked_at} />
                        </div>
                      )}
                    </div>
                    
                    {/* Progress Bar Visual */}
                    <div className="w-full bg-slate-200 rounded-full h-2 mb-4 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${((booking.splits.filter(s => s.status === 'paid').length + 1) / (booking.splits.length + 1)) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-xs font-bold text-slate-700">Host (You)</span>
                        <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded">Paid</span>
                      </div>
                      {booking.splits.map((split, i) => (
                        <div key={split.id} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200">
                          <span className="text-xs font-bold text-slate-700">Friend {i + 1}</span>
                          <div className="flex items-center gap-2">
                            {split.status === 'paid' ? (
                              <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded">Paid</span>
                            ) : split.status === 'declined' ? (
                              <span className="text-[10px] font-black uppercase bg-red-100 text-red-600 px-2 py-0.5 rounded">Declined</span>
                            ) : (
                              <>
                                <span className="text-[10px] font-black uppercase bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded">Pending</span>
                                {isPending && (
                                  <button 
                                    onClick={() => handleResendInvite(split.id)}
                                    className="text-[9px] font-black uppercase tracking-wider bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                                  >
                                    Copy Link
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 bg-white flex justify-end gap-3 border-t border-slate-100 rounded-b-2xl">
                  {isConfirmed && (
                    <>
                      <button 
                        onClick={() => handleViewQRTicket(booking.id)}
                        className="text-xs font-black uppercase text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors border border-indigo-100 flex items-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>🎟️</span> View QR Ticket
                      </button>
                      <button 
                        onClick={() => handleDownload(booking)}
                        className="text-xs font-black uppercase text-[#10b981] hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-100 flex items-center gap-2 cursor-pointer shadow-sm"
                      >
                        <span>📥</span> Download PDF
                      </button>
                    </>
                  )}
                  {isPending && booking.is_split && (
                    <button 
                      onClick={() => handleCancelBooking(booking.id)}
                      className="text-xs font-black uppercase text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors border border-red-100 flex items-center gap-2 cursor-pointer"
                    >
                      <span>✖️</span> Cancel & Refund
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Digital QR Ticket Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white relative">
            <button 
              onClick={() => setSelectedTicket(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-black text-lg cursor-pointer"
            >
              ✖
            </button>
            <div className="text-center mb-6">
              <span className="text-xs font-black uppercase text-emerald-400 tracking-widest bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">Official Venue Pass</span>
              <h3 className="text-2xl font-black text-white mt-2 tracking-tight">Turf Entry QR Ticket</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">Show this QR Code at the venue counter for instant check-in</p>
            </div>

            <div className="bg-white p-6 rounded-2xl flex flex-col items-center justify-center shadow-inner border border-slate-200">
              <img src={selectedTicket.ticket.qr_code_data} alt="QR Ticket" className="w-48 h-48 rounded-lg shadow-md" />
              <p className="text-xs font-black text-slate-900 font-mono mt-4 bg-slate-100 px-3 py-1 rounded border border-slate-300">
                {selectedTicket.ticket.ticket_code}
              </p>
            </div>

            <div className="mt-6 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Turf Venue:</span>
                <span className="font-bold text-white">Turf #{selectedTicket.booking.slot?.turf_id || 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Scheduled Slot:</span>
                <span className="font-bold text-emerald-400 font-mono">{selectedTicket.booking.slot?.start_time} - {selectedTicket.booking.slot?.end_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Total Paid:</span>
                <span className="font-black text-white">₹{selectedTicket.booking.final_amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-semibold">Issued Date:</span>
                <span className="font-semibold text-slate-300">{new Date(selectedTicket.ticket.issued_at).toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => window.print()} 
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black py-3 rounded-xl transition-all cursor-pointer border border-slate-700 shadow-md"
              >
                🖨️ Print Pass
              </button>
              <button 
                onClick={() => setSelectedTicket(null)} 
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black py-3 rounded-xl transition-all cursor-pointer shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Countdown Timer Component
function CountdownTimer({ bookedAt }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calculateTimeLeft = () => {
      const bookedTime = new Date(bookedAt).getTime();
      const expiryTime = bookedTime + 30 * 60 * 1000; // 30 minutes
      const now = new Date().getTime();
      const diff = expiryTime - now;

      if (diff <= 0) {
        setTimeLeft("00:00");
        return;
      }

      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [bookedAt]);

  return (
    <div className="text-sm font-black text-rose-500 tabular-nums animate-pulse">
      {timeLeft}
    </div>
  );
}
