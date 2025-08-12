/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'bingo-bg': '#0e0f14',
        'bingo-panel': '#171923',
        'bingo-panel-2': '#1f2333',
        'bingo-text': '#e9ecf1',
        'bingo-muted': '#aab1c2',
        'bingo-chip': '#262b3f',
        'bingo-cell': '#22273a',
        'bingo-mark': '#5b7cff',
      },
      animation: {
        'bounce-in': 'bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'shake': 'shake 0.5s ease-in-out',
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0.3) translateY(30px)', opacity: '0' },
          '20%': { transform: 'scale(0.9) translateY(-10px)', opacity: '0.8' },
          '40%': { transform: 'scale(1.2) translateY(5px)', opacity: '1' },
          '60%': { transform: 'scale(1.05) translateY(-5px)' },
          '80%': { transform: 'scale(1.1) translateY(2px)' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        glow: {
          '0%': { boxShadow: '0 12px 24px rgba(0,0,0,.3), 0 0 0 0 rgba(106, 121, 255, 0.4)' },
          '100%': { boxShadow: '0 12px 24px rgba(0,0,0,.3), 0 0 20px 5px rgba(106, 121, 255, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-2px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(2px)' },
        },
      },
    },
  },
  plugins: [],
} 