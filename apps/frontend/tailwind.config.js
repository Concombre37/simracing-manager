/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#050508',
          900: '#0a0a0f',
          800: '#12121a',
          700: '#1a1a25',
          600: '#252536',
          500: '#34344a',
        },
        accent: {
          red: '#ff3333',
          orange: '#ff6b35',
          yellow: '#ffc93c',
          green: '#22c55e',
          blue: '#00d4ff',
          purple: '#a855f7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'carbon-fiber':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.035) 1px, transparent 0)',
        'grid-fade': 'linear-gradient(to bottom, rgba(255,107,53,0.08), transparent 70%)',
      },
      backgroundSize: {
        carbon: '4px 4px',
      },
      boxShadow: {
        'glow-orange': '0 0 24px -4px rgba(255,107,53,0.55)',
        'glow-blue': '0 0 24px -4px rgba(0,212,255,0.5)',
        'glow-red': '0 0 24px -4px rgba(255,51,51,0.5)',
        'glow-green': '0 0 24px -4px rgba(34,197,94,0.5)',
      },
      keyframes: {
        'wizard-in-right': {
          '0%': { opacity: '0', transform: 'translateX(48px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'wizard-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-48px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'grid-pan': {
          '0%': { backgroundPosition: '0px 0px' },
          '100%': { backgroundPosition: '120px 120px' },
        },
        'blob-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(40px, -30px) scale(1.15)' },
          '66%': { transform: 'translate(-30px, 20px) scale(0.95)' },
        },
        'ring-pulse': {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
      },
      animation: {
        'wizard-in-right': 'wizard-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'wizard-in-left': 'wizard-in-left 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in-up': 'fade-in-up 0.4s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'grid-pan': 'grid-pan 30s linear infinite',
        'blob-drift': 'blob-drift 20s ease-in-out infinite',
        'ring-pulse': 'ring-pulse 1.6s cubic-bezier(0,0,0.2,1) infinite',
        blink: 'blink 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
