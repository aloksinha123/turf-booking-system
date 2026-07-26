import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

export default function CheckoutForm({ amount, expiresAt, onSuccess, onFail }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [isReady, setIsReady] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!stripe || !elements || !isReady) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");
    
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required', // We don't want to redirect away from our SPA unless necessary
      });

      if (error) {
        setErrorMessage(error.message);
        setIsProcessing(false);
        // We don't automatically fail the booking here unless they click cancel or timer expires.
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess();
      } else {
        setIsProcessing(false);
      }
    } catch (err) {
      setErrorMessage(err.message || "An unexpected error occurred during payment.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="mb-6 min-h-[200px]">
        <PaymentElement onReady={() => setIsReady(true)} />
      </div>
      
      {errorMessage && (
        <div className="text-rose-600 text-sm font-bold bg-rose-50 p-3 rounded-lg mb-4 border border-rose-200">
          {errorMessage}
        </div>
      )}

      <div className="space-y-3">
        <button 
          type="submit" 
          disabled={!stripe || isProcessing || !isReady}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95 text-lg disabled:opacity-50"
        >
          {isProcessing ? "Processing Securely..." : `Pay ₹${amount}`}
        </button>
        <button 
          type="button"
          onClick={onFail}
          disabled={isProcessing}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all disabled:opacity-50"
        >
          Cancel Booking
        </button>
      </div>
    </form>
  );
}
