import { Router } from 'express';
import { authController as c } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler as h } from '../utils/async-handler.js';
import { profileUpdate } from '../validators/schemas.js';

/**
 * Sign-up, login, verification, password reset and Google sign-in are handled
 * by Supabase Auth directly from the browser (anon key). These endpoints expose
 * the verified session user and their profile settings.
 */
export function authRoutes({ requireAuth, limits }) {
  const router = Router();
  router.use(requireAuth, limits.api);
  router.get('/me', h(c.me));
  router.patch('/profile', validate({ body: profileUpdate }), h(c.updateProfile));
  return router;
}
