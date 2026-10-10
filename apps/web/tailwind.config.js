/** Colours come from CSS variables in src/index.css, so one class works in light and dark. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mist: v('mist'),
        surface: v('surface'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), quiet: v('ink-quiet') },
        accent: { DEFAULT: v('accent'), fill: v('accent-fill'), deep: v('accent-deep') },
        gain: v('gain'),
        loss: v('loss'),
        deep: { DEFAULT: v('deep'), text: v('deep-text') },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { panel: '6px' },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.25,0.1,0.25,1)',
        sheet: 'cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        pulse2: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.45)' },
          '70%': { boxShadow: '0 0 0 7px rgb(var(--accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0)' },
        },
        bob: { '50%': { transform: 'translateY(3px)' } },
      },
      animation: {
        pulse2: 'pulse2 2.4s cubic-bezier(0.25,0.1,0.25,1) infinite',
        bob: 'bob 2s cubic-bezier(0.25,0.1,0.25,1) infinite',
      },
    },
  },
  plugins: [],
}
