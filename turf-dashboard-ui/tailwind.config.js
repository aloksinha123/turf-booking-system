/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // High-contrast Dark Stadium theme
        'stadium': {
          50:  '#f8fafc',
          100: '#f1f5f9',
          800: '#111827', // Deep dark stadium base
          850: '#0f172a', // Slightly darker slate-900
          900: '#0b0f19', // Pure dark stadium pitch border
          950: '#030712', // Ultra dark contrast
        },
        // Distinct Vivid Sport Colors
        'pitch-green': {     // Football / Turf A
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          950: '#022c22',
        },
        'pitch-gold': {      // Cricket / Turf B
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          950: '#451a03',
        },
        'pitch-indigo': {    // Badminton / Turf C
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          950: '#1e1b4b',
        },
        'surge': {
          500: '#f97316',
        },
        'flash': {
          500: '#84cc16',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'grass-grid-dark': "linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        'grass': '40px 40px',
      },
      keyframes: {
        'glow-green': { '0%, 100%': { boxShadow: '0 0 10px rgba(16,185,129,0.2)' }, '50%': { boxShadow: '0 0 25px rgba(16,185,129,0.7)' } },
        'glow-gold': { '0%, 100%': { boxShadow: '0 0 10px rgba(245,158,11,0.2)' }, '50%': { boxShadow: '0 0 25px rgba(245,158,11,0.7)' } },
        'glow-indigo': { '0%, 100%': { boxShadow: '0 0 10px rgba(99,102,241,0.2)' }, '50%': { boxShadow: '0 0 25px rgba(99,102,241,0.7)' } },
        'badge-float': { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-3px)' } },
      },
      animation: {
        'glow-green': 'glow-green 2s ease-in-out infinite',
        'glow-gold': 'glow-gold 2s ease-in-out infinite',
        'glow-indigo': 'glow-indigo 2s ease-in-out infinite',
        'badge-float': 'badge-float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}


