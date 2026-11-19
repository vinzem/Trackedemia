import { Router } from 'express';
import { createAiController } from '../controllers/ai.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler as h } from '../utils/async-handler.js';
import { extractRequest } from '../validators/schemas.js';

export function aiRoutes({ requireAuth, limits, services }) {
  const c = createAiController(services);
  const router = Router();
  router.post('/extract-reminders', requireAuth, limits.ai, validate({ body: extractRequest }), h(c.extract));
  return router;
}
