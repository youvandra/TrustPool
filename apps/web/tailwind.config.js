/** Light theme only. Tokens are documented in docs/design.md. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F3F6F7',
        surface: '#FFFFFF',
        subtle: '#F7F9FA',
        line: { DEFAULT: '#E4EAED', strong: '#D3DDE2' },
        ink: { DEFAULT: '#12212A', 2: '#3F525D', 3: '#7A8B95' },
        accent: { DEFAULT: '#2E6E8E', fill: '#E3EFF5', soft: '#F0F6F9', deep: '#1C4B63', lift: '#8CC3DE' },
        gain: { DEFAULT: '#0B7A57', fill: '#E3F4EC' },
        loss: { DEFAULT: '#C0352E', fill: '#FBEAE8' },
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,33,42,0.04), 0 6px 20px -10px rgba(18,33,42,0.10)',
        pop: '0 1px 2px rgba(18,33,42,0.06), 0 24px 48px -16px rgba(18,33,42,0.22)',
        ring: '0 0 0 4px rgba(46,110,142,0.12)',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.25,0.1,0.25,1)',
        out: 'cubic-bezier(0.22,1,0.36,1)',
        sheet: 'cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        pulse2: {
          '0%': { boxShadow: '0 0 0 0 rgba(46,110,142,0.45)' },
          '70%': { boxShadow: '0 0 0 7px rgba(46,110,142,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(46,110,142,0)' },
        },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        pulse2: 'pulse2 2.2s cubic-bezier(0.25,0.1,0.25,1) infinite',
        marquee: 'marquee 60s linear infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
