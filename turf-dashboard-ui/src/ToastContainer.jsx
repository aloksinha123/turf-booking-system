import React from 'react';

/**
 * ToastContainer renders floating animated toast notifications
 */
export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;

  const colorStyles = {
    success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200',
    warning: 'bg-amber-900/90 border-amber-500/50 text-amber-200',
    danger: 'bg-rose-900/90 border-rose-500/50 text-rose-200',
    purple: 'bg-purple-900/90 border-purple-500/50 text-purple-200',
    info: 'bg-indigo-900/90 border-indigo-500/50 text-indigo-200',
  };

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto border rounded-2xl p-4 shadow-2xl backdrop-blur-xl transition-all transform translate-y-0 animate-bounce-short flex items-start justify-between gap-3 text-xs ${
            colorStyles[toast.type] || colorStyles.info
          }`}
        >
          <div>
            <h4 className="font-black uppercase tracking-wider text-[11px] mb-0.5">{toast.title}</h4>
            <p className="font-semibold text-slate-300 text-[10px]">{toast.message}</p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
