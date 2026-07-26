import { fetchApi } from './apiClient';
import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from './CheckoutForm';
import { jsPDF } from 'jspdf';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "pk_test_dummy");
const API_BASE = "http://localhost:8085";

export default function PaySplit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [splitData, setSplitData] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (!token) {
      setError("No token provided");
      setLoading(false);
      return;
    }

    fetchApi(`${API_BASE}/api/v1/splits/verify/${token}`)
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Invalid or already paid token");
        }
        return res.json();
      })
      .then(data => {
        setSplitData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 grass-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600 font-bold text-sm">Verifying your split token...</p>
      </div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-slate-50 grass-bg flex items-center justify-center">
      <div className="bg-white border border-red-200 rounded-3xl p-8 max-w-sm w-full text-center shadow-xl">
        <div className="text-4xl mb-3">❌</div>
        <p className="text-red-600 font-black text-lg">{error}</p>
        <button onClick={() => window.location.href='/'} className="mt-5 text-xs font-bold text-slate-500 hover:text-slate-700 underline cursor-pointer">Go back home</button>
      </div>
    </div>
  );
  
  const downloadTicketPDF = async () => {
    try {
      const qrData = JSON.stringify({
        booking_id: splitData.booking_id,
        turf_name: splitData.turf_name,
        date: splitData.date || new Date().toISOString().split('T')[0],
        time: `${splitData.start_time} - ${splitData.end_time}`,
        amount: splitData.share_amount,
        token: splitData.token,
        status: "split_share_paid"
      });

      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}`;
      
      const response = await fetchApi(qrCodeUrl);
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
      doc.text("FRIEND'S SPLIT TICKET", 74, 25, { align: "center" });

      // Ticket Body
      doc.setTextColor(30, 41, 59);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text(splitData.turf_name, 15, 52);

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
      doc.text("YOUR SHARE", 15, 90);
      doc.text("TICKET STATUS", 15, 98);

      doc.setFont("Helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`#${splitData.booking_id}`, 55, 66);
      doc.text(splitData.date || "Today", 55, 74);
      doc.text(`${splitData.start_time} - ${splitData.end_time}`, 55, 82);
      doc.text(`INR ${splitData.share_amount}`, 55, 90);
      
      doc.setTextColor(16, 185, 129); // Emerald-500
      doc.text("SHARE PAID - SUCCESS", 55, 98);

      // Add QR Code
      doc.addImage(qrBase64, "PNG", 49, 110, 50, 50);

      // Footer
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Scan QR Code at the entry gate to verify your share.", 74, 172, { align: "center" });
      doc.text("Thank you for playing with Bovox!", 74, 178, { align: "center" });

      doc.save(`Split_Share_Booking_${splitData.booking_id}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF ticket.");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-[#0b0f19] border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl text-slate-200">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎉</span>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Payment Successful!</h2>
          <p className="text-slate-400 mb-6">You've successfully paid your share of ₹{splitData.share_amount} for {splitData.turf_name}.</p>
          
          <div className="flex justify-center mb-6">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                JSON.stringify({
                  booking_id: splitData.booking_id,
                  turf_name: splitData.turf_name,
                  date: splitData.date || new Date().toISOString().split('T')[0],
                  time: `${splitData.start_time} - ${splitData.end_time}`,
                  amount: splitData.share_amount,
                  token: splitData.token,
                  status: "split_share_paid"
                })
              )}`} 
              alt="Booking QR Code" 
              className="w-28 h-28 bg-white p-2 rounded-xl shadow-md border border-slate-700/50"
            />
          </div>

          <div className="space-y-3">
            <button 
              onClick={downloadTicketPDF}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
            >
              📥 Download Ticket (PDF)
            </button>
            <button 
              onClick={() => window.location.href = "/"}
              className="w-full bg-transparent border border-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-colors hover:bg-slate-800 cursor-pointer"
            >
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 grass-bg flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
            <span className="text-3xl">🏟️</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-1">Split Bill Payment</h1>
          <p className="text-slate-400 text-sm font-semibold">Pay your share to confirm the turf slot!</p>
        </div>
        
        <div className="bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-200">
          <div className="flex justify-between items-center mb-3">
            <span className="text-slate-500 font-semibold text-sm">Venue</span>
            <span className="text-slate-900 font-black text-right text-sm">{splitData.turf_name}</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-slate-500 font-semibold text-sm">Time Slot</span>
            <span className="text-slate-900 font-black text-sm">{splitData.start_time} – {splitData.end_time}</span>
          </div>
          {splitData.date && (
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-500 font-semibold text-sm">Date</span>
              <span className="text-slate-900 font-black text-sm">{splitData.date}</span>
            </div>
          )}
          <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
            <span className="text-slate-700 font-black">Your Share</span>
            <span className="text-3xl font-black text-emerald-600">₹{splitData.share_amount}</span>
          </div>
        </div>

        {splitData.client_secret && (
          <Elements stripe={stripePromise} options={{ clientSecret: splitData.client_secret, appearance: { theme: 'stripe', variables: { colorPrimary: '#10b981' } } }}>
            <CheckoutForm 
              amount={splitData.share_amount}
              onSuccess={async () => {
                try {
                  await fetchApi(`${API_BASE}/webhooks/payment`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ booking_id: splitData.booking_id, status: "success", split_token: splitData.token })
                  });
                } catch (e) { console.error("Mock webhook failed", e); }
                setSuccess(true);
              }}
              onFail={() => setError("Payment failed. Please try again.")}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

