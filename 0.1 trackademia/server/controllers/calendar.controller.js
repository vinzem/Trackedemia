/** HTTP handlers for /api/calendar (OAuth connection + event operations). */
import { getProfile, updateProfile } from '../services/profile.service.js';

export function createCalendarController({ calendar, reminders, config, logger }) {
  const settingsRedirect = (path, params) => {
    const url = new URL(path || '/settings', config.appUrl);
    Object.entries(params).forEach(([key, value]) => value && url.searchParams.set(key, value));
    return url.toString();
  };

  return {
    async status(req, res) {
      const [status, profile] = await Promise.all([calendar.getStatus(req.user.id), getProfile(req.db, req.user)]);
      res.json({ data: { ...status, default_calendar_id: profile.default_calendar_id, default_calendar_name: profile.default_calendar_name } });
    },

    async connect(req, res) {
      const url = await calendar.createAuthorizationUrl(req.user.id, { redirectPath: req.valid.query.redirect || '/settings', loginHint: req.user.email });
      res.json({ data: { url } });
    },

    /** Google redirects the browser here. Authenticated by the signed, single-use state. */
    async callback(req, res) {
      try {
        const result = await calendar.handleCallback(req.valid.query);
        if (result.error) return res.redirect(303, settingsRedirect(result.redirectPath, { calendar: 'error', reason: result.error }));
        return res.redirect(303, settingsRedirect(result.redirectPath, { calendar: 'connected' }));
      } catch (error) {
        logger.warn('oauth_callback_failed', { error_code: error.code, status: error.status });
        return res.redirect(303, settingsRedirect('/settings', { calendar: 'error', reason: error.code === 'validation_error' ? 'invalid_state' : 'server_error' }));
      }
    },

    async calendars(req, res) {
      const items = await calendar.listCalendars(req.user.id);
      const profile = await getProfile(req.db, req.user);
      let defaultId = profile.default_calendar_id;
      if (!defaultId || !items.some((item) => item.id === defaultId)) {
        const primary = items.find((item) => item.primary) || items[0];
        if (primary) {
          await updateProfile(req.db, req.user, { default_calendar_id: primary.id, default_calendar_name: primary.name });
          defaultId = primary.id;
        }
      }
      res.json({ data: items.map((item) => ({ ...item, is_default: item.id === defaultId })) });
    },

    async disconnect(req, res) {
      const result = await calendar.disconnect(req.user.id);
      await updateProfile(req.db, req.user, { default_calendar_id: null, default_calendar_name: null });
      res.json({ data: result });
    },

    /** Creates (or retries) the Google event for an existing reminder. */
    async createEvent(req, res) {
      res.status(201).json({ data: await reminders.sync(req.db, req.user, req.valid.body.reminder_id) });
    },
    async getEvent(req, res) {
      res.json({ data: await reminders.getCalendarEvent(req.db, req.user, req.valid.params.id) });
    },
    /** Re-pushes the reminder's current fields to its Google event. */
    async updateEvent(req, res) {
      res.json({ data: await reminders.sync(req.db, req.user, req.valid.params.id) });
    },
    /** Deletes the Google event but keeps the reminder. */
    async deleteEvent(req, res) {
      res.json({ data: await reminders.unlinkCalendarEvent(req.db, req.user, req.valid.params.id) });
    },
  };
}
