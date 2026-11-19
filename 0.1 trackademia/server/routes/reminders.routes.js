import { Router } from 'express';
import { createRemindersController } from '../controllers/reminders.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler as h } from '../utils/async-handler.js';
import { idParams, reminderCreate, reminderUpdate, remindersQuery } from '../validators/schemas.js';

export function remindersRoutes({ requireAuth, limits, services }) {
  const c = createRemindersController(services);
  const router = Router();
  router.use(requireAuth, limits.api);
  router.get('/', validate({ query: remindersQuery }), h(c.list));
  router.post('/', validate({ body: reminderCreate }), h(c.create));
  router.get('/:id', validate({ params: idParams }), h(c.get));
  router.patch('/:id', validate({ params: idParams, body: reminderUpdate }), h(c.update));
  router.delete('/:id', validate({ params: idParams }), h(c.remove));
  return router;
}
