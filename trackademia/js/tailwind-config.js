// Tailwind Play CDN configuration shared by every page. Preflight is disabled
// because css/styles.css provides the base reset and design tokens.
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        canvas: '#F5F5F5',
        ink: { DEFAULT: '#222222', muted: '#737373' },
        line: { DEFAULT: '#D4D4D4', dashed: '#C7C7C7' },
        placeholder: '#F0F0F0',
        primary: '#6366F1',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
    },
  },
};
