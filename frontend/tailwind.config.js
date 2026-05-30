/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // single family across the app
      fontFamily: {
        display: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
        sans: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
        mono: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
      },
      // Map utilities to theme CSS variables so light/dark switch automatically.
      colors: {
        bg: 'var(--bg)',
        bgsoft: 'var(--bg-soft)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        amber: 'var(--amber)',
        teal: 'var(--teal)',
      },
      borderColor: {
        line: 'var(--line)',
        linehi: 'var(--line-strong)',
      },
    },
  },
  plugins: [],
}
