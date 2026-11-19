import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Only VITE_* variables are exposed to the browser. API_URL is mapped
    // explicitly because it is shared with the server configuration.
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL || env.API_URL || 'http://localhost:8787'),
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173 },
    build: {
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: { manualChunks: { supabase: ['@supabase/supabase-js'], luxon: ['luxon'] } },
      },
    },
  };
});
