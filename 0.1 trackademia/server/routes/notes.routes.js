import { Router } from 'express';
import { createNotesController } from '../controllers/notes.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler as h } from '../utils/async-handler.js';
import { idParams, noteCreate, noteUpdate, notesQuery } from '../validators/schemas.js';

export function notesRoutes({ requireAuth, limits, services }) {
  const c = createNotesController({ services });
  const router = Router();
  router.use(requireAuth, limits.api);
  router.get('/', validate({ query: notesQuery }), h(c.list));
  router.post('/', validate({ body: noteCreate }), h(c.create));
  router.get('/:id', validate({ params: idParams }), h(c.get));
  router.patch('/:id', validate({ params: idParams, body: noteUpdate }), h(c.update));
  router.delete('/:id', validate({ params: idParams }), h(c.remove));
  return router;
}
