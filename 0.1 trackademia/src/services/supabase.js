/** Browser Supabase client (anon key only; RLS protects all data). */
import { createClient } from '@supabase/supabase-js';
import { config, isSupabaseConfigured } from '../config.js';

function mockSessionForUser(user) {
  const now = Date.now();
  const baseUser = {
    id: user.id || 'local-dev-user',
    email: user.email || 'dev@example.com',
    app_metadata: { provider: user.provider || 'email' },
    user_metadata: {
      full_name: user.name || user.email?.split('@')[0] || 'Local user',
      avatar_url: user.avatarUrl || null,
    },
  };
  return {
    access_token: `local-dev-access-${now}`,
    refresh_token: `local-dev-refresh-${now}`,
    expires_in: 3600,
    expires_at: Math.floor((now + 3600_000) / 1000),
    token_type: 'bearer',
    user: baseUser,
  };
}

const mockAuth = (() => {
  const storageKey = 'trackademia:mock-session';
  const userKey = 'trackademia:mock-users';
  const listeners = new Set();

  const readJson = (key, fallback) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };

  const readUsers = () => readJson(userKey, {});
  const writeUsers = (users) => writeJson(userKey, users);

  function emit(event, session) {
    listeners.forEach((listener) => listener(event, session));
  }

  return {
    auth: {
      async getSession() {
        return { data: { session: readJson(storageKey, null) }, error: null };
      },
      onAuthStateChange(callback) {
        listeners.add(callback);
        const session = readJson(storageKey, null);
        callback(session ? 'INITIAL_SESSION' : 'SIGNED_OUT', session);
        return { unsubscribe() { listeners.delete(callback); } };
      },
      async signUp({ email, password, options }) {
        if (!email || !password) {
          return { data: { session: null, user: null }, error: { message: 'Email and password are required.', code: 'missing_credentials' } };
        }
        const users = readUsers();
        const key = String(email).trim().toLowerCase();
        if (users[key]) {
          return { data: { session: null, user: null }, error: { message: 'An account with this email already exists. Try signing in.', code: 'user_already_exists' } };
        }
        const user = { id: `dev-${Math.random().toString(36).slice(2, 9)}`, email: key, name: options?.data?.full_name || key.split('@')[0], provider: 'email' };
        users[key] = { ...user, password };
        writeUsers(users);
        const session = mockSessionForUser(user);
        writeJson(storageKey, session);
        emit('SIGNED_IN', session);
        return { data: { session, user: session.user }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const key = String(email || '').trim().toLowerCase();
        const users = readUsers();
        let user = users[key];
        if (!user) {
          user = { id: `dev-${Math.random().toString(36).slice(2, 9)}`, email: key, name: key.split('@')[0], provider: 'email', password: String(password || '') };
          users[key] = user;
          writeUsers(users);
        }
        if (user.password !== String(password || '')) {
          return { data: { session: null, user: null }, error: { message: 'Invalid login credentials', code: 'invalid_login_credentials' } };
        }
        const session = mockSessionForUser({ id: user.id, email: user.email, name: user.name, provider: 'email' });
        writeJson(storageKey, session);
        emit('SIGNED_IN', session);
        return { data: { session, user: session.user }, error: null };
      },
      async resend() {
        return { data: {}, error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      async updateUser({ password }) {
        const session = readJson(storageKey, null);
        if (!session) {
          return { data: { user: null }, error: { message: 'No active session.', code: 'no_session' } };
        }
        const users = readUsers();
        const email = session.user.email;
        if (users[email]) users[email].password = password;
        writeUsers(users);
        return { data: { user: session.user }, error: null };
      },
      async exchangeCodeForSession() {
        const session = readJson(storageKey, null);
        if (!session) return { data: { session: null, user: null }, error: { message: 'No active session.', code: 'no_session' } };
        writeJson(storageKey, session);
        emit('SIGNED_IN', session);
        return { data: { session, user: session.user }, error: null };
      },
      async refreshSession() {
        const session = readJson(storageKey, null);
        if (!session) return { data: { session: null }, error: null };
        const refreshed = mockSessionForUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          provider: session.user.app_metadata?.provider || 'email',
        });
        writeJson(storageKey, refreshed);
        return { data: { session: refreshed }, error: null };
      },
      async signOut() {
        writeJson(storageKey, null);
        emit('SIGNED_OUT', null);
        return { error: null };
      },
    },
  };
})();

export const supabase = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'trackademia-auth' },
  })
  : mockAuth;
