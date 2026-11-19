/**
 * Supabase clients.
 * - `createUserClient(token)` forwards the caller's JWT, so Postgres Row Level
 *   Security applies to every notes / reminders / profile query.
 * - `createAdminClient()` uses the service role and is only used for tables
 *   that browsers must never touch (google_connections, oauth_states) and for
 *   verifying access tokens.
 */
import { createClient } from '@supabase/supabase-js';

const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function createDatabase(config) {
  const { url, anonKey, serviceRoleKey } = config.supabase;
  if (!url || !anonKey || !serviceRoleKey) return null;
  const admin = createClient(url, serviceRoleKey, CLIENT_OPTIONS);
  return {
    admin,
    forUser(accessToken) {
      return createClient(url, anonKey, {
        ...CLIENT_OPTIONS,
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
    },
  };
}
