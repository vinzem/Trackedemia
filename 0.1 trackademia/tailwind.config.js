/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        ink: { DEFAULT: 'var(--color-text)', muted: 'var(--color-text-secondary)', faint: 'var(--color-text-muted)' },
        line: { DEFAULT: 'var(--color-border)', subtle: 'var(--color-border-subtle)' },
        primary: { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)', soft: 'var(--color-primary-soft)' },
        success: { DEFAULT: 'var(--color-success)', soft: 'var(--color-success-soft)' },
        danger: { DEFAULT: 'var(--color-error)', soft: 'var(--color-error-soft)' },
        warning: { DEFAULT: 'var(--color-warning)', soft: 'var(--color-warning-soft)' },
        highlight: 'var(--color-highlight)',
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      maxWidth: { content: '72rem', editor: '48rem' },
    },
  },
  plugins: [],
};
