import { fetchApi } from './apiClient';
import React, { useState } from 'react';

export default function Login({ apiBase, triggerAlert, onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('customer'); // 'customer' or 'admin'
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('1234');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCustomerLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetchApi(`${apiBase}/auth/login/customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp })
      });
      const data = await response.json();
      
      if (response.ok) {
        triggerAlert("Logged in as Customer successfully!", false);
        onLoginSuccess(data.token, data.user);
      } else {
        triggerAlert(data.error || "Login failed", true);
      }
    } catch (err) {
      triggerAlert("Network connection error", true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetchApi(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      
      if (response.ok) {
        triggerAlert("Logged in as Admin successfully!", false);
        onLoginSuccess(data.token, data.user);
      } else {
        triggerAlert(data.error || "Invalid credentials", true);
      }
    } catch (err) {
      triggerAlert("Network connection error", true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-[1000px] bg-white rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden min-h-[650px]">
        
        {/* Left Side: Brand & Visuals */}
        <div className="w-full md:w-[45%] relative hidden md:flex flex-col justify-between p-10 overflow-hidden bg-slate-900">
          {/* Unsplash Placeholder Turf Background */}
          <div 
            className="absolute inset-0 bg-cover bg-center z-0" 
            style={{ backgroundImage: "url('/turf-login.png')", opacity: 0.6 }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-0"></div>
          
          <div className="relative z-10 pt-8">
            <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight">
              Book Your Game.<br/>
              <span className="text-[#34d399]">Own The Turf.</span>
            </h1>
            <p className="text-slate-200 mt-6 font-medium max-w-xs text-sm leading-relaxed">
              Find and book the best turfs near you in just a few clicks.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-4 pb-4">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto border-2 border-emerald-400 rounded-xl flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <h4 className="text-[10px] font-black text-white uppercase tracking-wider">Easy Booking</h4>
              <p className="text-[9px] text-slate-300 mt-1 leading-tight">Book your favorite turf in seconds</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto border-2 border-emerald-400 rounded-xl flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </div>
              <h4 className="text-[10px] font-black text-white uppercase tracking-wider">Secure</h4>
              <p className="text-[9px] text-slate-300 mt-1 leading-tight">100% secure transactions</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto border-2 border-emerald-400 rounded-xl flex items-center justify-center mb-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              </div>
              <h4 className="text-[10px] font-black text-white uppercase tracking-wider">Play Together</h4>
              <p className="text-[9px] text-slate-300 mt-1 leading-tight">Invite friends and enjoy the game</p>
            </div>
          </div>
        </div>

        {/* Right Side: Form & Inputs */}
        <div className="w-full md:w-[55%] p-8 md:p-12 lg:p-16 flex flex-col justify-center bg-white relative">
          
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#166534] flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm-1-13h2v4h-2V7zm0 6h2v2h-2v-2z" /></svg>
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Turf<span className="text-[#166534]">Book</span></h2>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-2">Welcome Back</h3>
            <p className="text-sm text-slate-500 font-medium">Login to continue to your account</p>
          </div>

          {/* Form Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl mb-8 border border-slate-200 shadow-inner">
            <button 
              type="button"
              className={`flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${activeTab === 'customer' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab('customer')}
            >
              🏏 Player Login
            </button>
            <button 
              type="button"
              className={`flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all ${activeTab === 'admin' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab('admin')}
            >
              🛡️ Turf Partner
            </button>
          </div>

          <div className="w-full">
            {activeTab === 'customer' ? (
              <form onSubmit={handleCustomerLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Mobile Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    </div>
                    <input 
                      type="text" 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      required
                      className="w-full pl-11 bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">OTP Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    </div>
                    <input 
                      type="text" 
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter OTP (Use 1234)"
                      required
                      className="w-full pl-11 bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:font-normal placeholder:text-slate-400"
                    />
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer text-slate-400 hover:text-slate-600 transition-colors">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-[10px] text-slate-500 font-semibold">New account? Auto-created on login.</p>
                    <a href="#" className="text-xs font-black text-emerald-600 hover:text-emerald-700">Resend OTP?</a>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-green-600/20 disabled:opacity-50 cursor-pointer mt-2"
                >
                  {isLoading ? 'Verifying...' : 'Login & Book'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAdminLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    </div>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full pl-11 bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    </div>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="w-full pl-11 bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:font-normal placeholder:text-slate-400"
                    />
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer text-slate-400 hover:text-slate-600 transition-colors">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                    </div>
                  </div>
                  <div className="text-right mt-2">
                    <a href="#" className="text-xs font-black text-[#16a34a] hover:text-[#15803d]">Forgot Password?</a>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full bg-[#2a6836] hover:bg-[#1a4b24] text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-[#2a6836]/20 disabled:opacity-50 cursor-pointer mt-2"
                >
                  {isLoading ? 'Authenticating...' : 'Login'}
                </button>
              </form>
            )}

            {/* Social Login Separator */}
            <div className="mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-400 font-medium">or continue with</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <button type="button" className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  <span className="text-xs font-bold text-slate-700">Google</span>
                </button>
                <button type="button" className="flex items-center justify-center gap-2 w-full py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
                  <svg className="w-4 h-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  <span className="text-xs font-bold text-slate-700">Facebook</span>
                </button>
              </div>

              <div className="mt-8 text-center">
                <p className="text-xs text-slate-500 font-medium">
                  Don't have an account? <a href="#" className="font-bold text-[#16a34a] hover:text-[#15803d]">Sign up</a>
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
