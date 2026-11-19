/* global __API_URL__ */
/** Public runtime configuration. Never put secrets here: everything is shipped to the browser. */
const env = import.meta.env;

export const config = Object.freeze({
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || '',
  apiUrl: String(env.VITE_API_URL || (typeof __API_URL__ !== 'undefined' ? __API_URL__ : '') || 'http://localhost:8787').replace(/\/$/, ''),
  appName: 'Trackademia',
});

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
