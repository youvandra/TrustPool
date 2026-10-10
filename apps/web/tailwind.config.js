/** Light theme only. Tokens are documented in docs/design.md. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F2F5F7',
        surface: '#FFFFFF',
        subtle: '#F6F8FA',
        line: { DEFAULT: '#E2E8EC', strong: '#CCD5DC' },
        ink: { DEFAULT: '#0F1D24', 2: '#364852', 3: '#66777F' },
        accent: { DEFAULT: '#1F6E9C', strong: '#165578', deep: '#123F5A', fill: '#DBEAF4', soft: '#EDF5FA', bright: '#3A97D4', lift: '#9CCBE8' },
        gain: { DEFAULT: '#0A8A5F', fill: '#DCF3E8' },
        loss: { DEFAULT: '#D23A2F', fill: '#FDE8E5' },
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,29,36,0.05), 0 8px 24px -12px rgba(15,29,36,0.12)',
        pop: '0 1px 2px rgba(18,33,42,0.06), 0 24px 48px -16px rgba(18,33,42,0.22)',
        ring: '0 0 0 4px rgba(31,110,156,0.14)',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.25,0.1,0.25,1)',
        out: 'cubic-bezier(0.22,1,0.36,1)',
        sheet: 'cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        pulse2: {
          '0%': { boxShadow: '0 0 0 0 rgba(31,110,156,0.5)' },
          '70%': { boxShadow: '0 0 0 7px rgba(31,110,156,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(31,110,156,0)' },
        },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        bob: { '50%': { transform: 'translateY(3px)' } },
      },
      animation: {
        pulse2: 'pulse2 2.2s cubic-bezier(0.25,0.1,0.25,1) infinite',
        marquee: 'marquee 60s linear infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        bob: 'bob 2s cubic-bezier(0.25,0.1,0.25,1) infinite',
      },
    },
  },
  plugins: [],
}
