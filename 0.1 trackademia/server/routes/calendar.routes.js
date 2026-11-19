import { Router } from 'express';
import { createCalendarController } from '../controllers/calendar.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler as h } from '../utils/async-handler.js';
import { calendarEventCreate, calendarEventUpdate, callbackQuery, connectQuery, idParams } from '../validators/schemas.js';

export function calendarRoutes({ requireAuth, limits, services, config, logger }) {
  const c = createCalendarController({ ...services, config, logger });
  const router = Router();
  // Public: Google redirects the browser here; protected by signed single-use state.
  router.get('/callback', limits.oauth, validate({ query: callbackQuery }), h(c.callback));

  router.use(requireAuth, limits.api);
  router.get('/status', h(c.status));
  router.get('/connect', limits.oauth, validate({ query: connectQuery }), h(c.connect));
  router.get('/calendars', h(c.calendars));
  router.post('/disconnect', h(c.disconnect));
  router.post('/events', validate({ body: calendarEventCreate }), h(c.createEvent));
  router.get('/events/:id', validate({ params: idParams }), h(c.getEvent));
  router.patch('/events/:id', validate({ params: idParams, body: calendarEventUpdate }), h(c.updateEvent));
  router.delete('/events/:id', validate({ params: idParams }), h(c.deleteEvent));
  return router;
}
