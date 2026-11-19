/**
 * Verifies Supabase access tokens and hands out user-scoped database clients.
 * The service-role key never leaves the server.
 */
import { AppError, notConfigured, unauthorized } from '../utils/errors.js';

export function createAuthService({ database }) {
  return {
    async verifyAccessToken(token) {
      if (!database) throw notConfigured('Supabase');
      let result;
      try {
        result = await database.admin.auth.getUser(token);
      } catch (cause) {
        throw new AppError('Authentication service unavailable.', { status: 503, code: 'auth_unavailable', retryable: true, cause });
      }
      const { data, error } = result;
      if (error || !data?.user) {
        const expired = /expired/i.test(error?.message || '');
        throw unauthorized(expired ? 'Your session has expired. Please sign in again.' : 'Invalid session.', expired ? 'session_expired' : 'invalid_session');
      }
      const { user } = data;
      return {
        id: user.id,
        email: user.email,
        emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        provider: user.app_metadata?.provider || 'email',
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatarUrl: user.user_metadata?.avatar_url || null,
      };
    },
    userDb(token) {
      return database.forUser(token);
    },
  };
}
