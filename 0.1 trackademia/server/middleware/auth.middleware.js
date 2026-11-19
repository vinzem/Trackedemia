/**
 * Authenticates requests with the Supabase access token sent as
 * `Authorization: Bearer <jwt>`. On success it attaches `req.user` and a
 * user-scoped database client `req.db` (Row Level Security enforced).
 */
import { unauthorized } from '../utils/errors.js';

export function extractBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/);
  return match ? match[1] : null;
}

export function createAuthMiddleware({ authService }) {
  return async function requireAuth(req, _res, next) {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) throw unauthorized();
      const user = await authService.verifyAccessToken(token);
      req.user = user;
      req.accessToken = token;
      req.db = authService.userDb(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
