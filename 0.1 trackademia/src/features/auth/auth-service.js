/** Supabase Auth operations (email/password and reset) + profile API. */
import { api } from '../../services/api-client.js';
import { supabase } from '../../services/supabase.js';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

const redirect = (path) => `${window.location.origin}${path}`;

function friendly(error) {
  const message = error?.message || 'Authentication failed.';
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox for the verification link.';
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Try signing in.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/network|fetch/i.test(message)) return 'Could not reach the sign-in service. Check your connection.';
  return message;
}

async function run(promise) {
  const { data, error } = await promise;
  if (error) {
    const wrapped = new Error(friendly(error));
    wrapped.code = error.code || error.name;
    throw wrapped;
  }
  return data;
}

function isMockClient() {
  return Boolean(supabase && supabase.auth && !supabase.auth.getUser);
}

export const authService = {
  isConfigured: () => Boolean(supabase),
  getSession: async () => (supabase ? (await supabase.auth.getSession()).data.session : null),
  onChange: (callback) => (supabase ? supabase.auth.onAuthStateChange(callback) : { unsubscribe() {} }),

  signUp: ({ email, password, name }) => run(requireClient().auth.signUp({
    email, password, options: { emailRedirectTo: redirect('/auth/callback'), data: { full_name: name } },
  })),
  signIn: ({ email, password }) => run(requireClient().auth.signInWithPassword({ email, password })),
  resendVerification: (email) => run(requireClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect('/auth/callback') } })),
  requestPasswordReset: (email) => run(requireClient().auth.resetPasswordForEmail(email, { redirectTo: redirect('/reset-password') })),
  updatePassword: (password) => run(requireClient().auth.updateUser({ password })),
  exchangeCode: (code) => run(requireClient().auth.exchangeCodeForSession(code)),
  signOut: async () => { if (supabase) await supabase.auth.signOut(); },

  async me() {
    if (isMockClient()) {
      const session = (await supabase.auth.getSession()).data.session;
      const user = session?.user || { id: 'local-dev-user', email: 'dev@example.com', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Demo user' } };
      const profile = { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Demo user', timezone: 'UTC' };
      return { user: { id: user.id, email: user.email, app_metadata: user.app_metadata, user_metadata: user.user_metadata }, profile };
    }
    return api.get('/api/auth/me').then((res) => res.data);
  },
  async updateProfile(patch) {
    if (isMockClient()) {
      const session = (await supabase.auth.getSession()).data.session;
      const profile = { id: session?.user?.id || 'local-dev-user', email: session?.user?.email || 'dev@example.com', name: patch.name || session?.user?.user_metadata?.full_name || 'Demo user', timezone: patch.timezone || 'UTC' };
      const user = { ...session?.user, user_metadata: { ...(session?.user?.user_metadata || {}), ...patch } };
      if (session) session.user = user;
      return profile;
    }
    return api.patch('/api/auth/profile', patch).then((res) => res.data);
  },
};
