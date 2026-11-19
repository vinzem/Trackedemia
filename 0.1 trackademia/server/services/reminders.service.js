/**
 * Reminder workflow: persists reminders and keeps them in sync with Google
 * Calendar through the calendar service. A reminder is only marked `synced`
 * after the Google API confirms the operation.
 */
import { DateTime } from 'luxon';
import { AppError, badRequest, conflict, fromDatabaseError, notFound } from '../utils/errors.js';
import { hashKey } from '../utils/crypto.js';
import { toEventWindow, toLocalFields } from '../utils/date-parser.js';
import { eventIdForReminder, toGoogleEvent } from './google-calendar.service.js';
import { getProfile } from './profile.service.js';

const COLUMNS = 'id, user_id, note_id, event_title, event_description, start_datetime, end_datetime, all_day, timezone, calendar_id, calendar_name, google_event_id, google_event_link, status, sync_error, last_synced_at, source_text, created_at, updated_at';

/** Adds local wall-clock fields so the UI does not have to convert timezones. */
export function presentReminder(row) {
  if (!row) return row;
  return { ...row, local: toLocalFields(row) };
}

/** Moves `date` by the same number of days `from` moved to `to` (keeps multi-day spans intact). */
function shiftDate(date, from, to) {
  if (!date || !to || to === from) return date;
  const delta = DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days;
  return DateTime.fromISO(date).plus({ days: delta }).toISODate();
}

export function dedupeKeyFor({ noteId, title, start }) {
  return hashKey(noteId || 'none', title.trim().toLowerCase(), start.toUTC().toISO());
}

function windowOrThrow(input) {
  const window = toEventWindow(input);
  if (!window.start.isValid || !window.end.isValid) throw badRequest('Invalid date, time or timezone.');
  if (window.end <= window.start) throw badRequest('End must be after start.', [{ path: 'end_time', message: 'End must be after start.' }]);
  if (window.start.year < 2000 || window.start.year > 2100) throw badRequest('Date is out of the supported range.');
  return window;
}

export function createRemindersService({ calendar, config, logger }) {
  async function fetchReminder(db, userId, id) {
    const { data, error } = await db.from('reminders').select(COLUMNS).eq('user_id', userId).eq('id', id).maybeSingle();
    if (error) throw fromDatabaseError(error, 'Reminder');
    if (!data) throw notFound('Reminder');
    return data;
  }

  async function writeReminder(db, userId, id, patch) {
    const { data, error } = await db.from('reminders').update(patch).eq('user_id', userId).eq('id', id).select(COLUMNS).maybeSingle();
    if (error) throw fromDatabaseError(error, 'Reminder');
    if (!data) throw notFound('Reminder');
    return data;
  }

  async function assertNoteOwned(db, userId, noteId) {
    if (!noteId) return;
    const { data, error } = await db.from('notes').select('id').eq('user_id', userId).eq('id', noteId).maybeSingle();
    if (error) throw fromDatabaseError(error, 'Note');
    if (!data) throw notFound('Note');
  }

  function eventBodyFor(row, { withId = false } = {}) {
    const window = {
      start: DateTime.fromISO(row.start_datetime, { zone: 'utc' }).setZone(row.timezone),
      end: DateTime.fromISO(row.end_datetime, { zone: 'utc' }).setZone(row.timezone),
    };
    return toGoogleEvent({
      id: withId ? eventIdForReminder(row.id) : undefined,
      title: row.event_title,
      description: row.event_description,
      start: window.start,
      end: window.end,
      allDay: row.all_day,
      timezone: row.timezone,
      reminderId: row.id,
      noteId: row.note_id,
      appUrl: config.appUrl,
    });
  }

  /** Pushes a reminder to Google Calendar, recording success or failure. */
  async function pushToCalendar(db, userId, row) {
    if (!row.calendar_id) throw new AppError('Choose a Google Calendar first.', { status: 400, code: 'calendar_required', recovery: 'choose_calendar' });
    await writeReminder(db, userId, row.id, { status: 'syncing', sync_error: null });
    try {
      let event;
      if (row.google_event_id) {
        try {
          event = await calendar.updateEvent(userId, row.calendar_id, row.google_event_id, eventBodyFor(row));
        } catch (error) {
          if (error.code !== 'calendar_event_not_found') throw error;
          ({ event } = await calendar.createEvent(userId, row.calendar_id, eventBodyFor(row, { withId: true })));
        }
      } else {
        ({ event } = await calendar.createEvent(userId, row.calendar_id, eventBodyFor(row, { withId: true })));
      }
      if (!event?.id) throw new AppError('Google Calendar did not confirm the event.', { status: 502, code: 'calendar_unconfirmed', retryable: true, recovery: 'retry' });
      return await writeReminder(db, userId, row.id, {
        status: 'synced',
        google_event_id: event.id,
        google_event_link: event.htmlLink || null,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      });
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Calendar sync failed.';
      await writeReminder(db, userId, row.id, { status: 'failed', sync_error: message.slice(0, 500) }).catch(() => {});
      logger?.warn('reminder_sync_failed', { user: userId, reminder: row.id, error_code: error.code });
      throw error;
    }
  }

  return {
    async list(db, userId, { note_id: noteId, status, from, limit = 100 } = {}) {
      let query = db.from('reminders').select(COLUMNS).eq('user_id', userId);
      if (noteId) query = query.eq('note_id', noteId);
      if (status) query = query.eq('status', status);
      if (from) query = query.gte('start_datetime', from);
      const { data, error } = await query.order('start_datetime', { ascending: true }).limit(limit);
      if (error) throw fromDatabaseError(error, 'Reminders');
      return (data || []).map(presentReminder);
    },

    async get(db, userId, id) {
      return presentReminder(await fetchReminder(db, userId, id));
    },

    /**
     * Creates a reminder and (by default) the Google Calendar event.
     * Duplicate attempts for the same note/title/start return 409 with the
     * existing reminder so the client can show it instead of creating another.
     */
    async create(db, user, input) {
      const userId = user.id;
      await assertNoteOwned(db, userId, input.note_id);
      const window = windowOrThrow(input);
      const profile = await getProfile(db, user);
      const calendarId = input.calendar_id || profile.default_calendar_id || null;
      const calendarName = input.calendar_id ? (input.calendar_name || null) : (profile.default_calendar_name || null);
      if (input.sync && !calendarId) throw new AppError('Choose a Google Calendar first.', { status: 400, code: 'calendar_required', recovery: 'choose_calendar' });

      const dedupeKey = dedupeKeyFor({ noteId: input.note_id, title: input.event_title, start: window.start });
      const { data: existing, error: lookupError } = await db.from('reminders').select(COLUMNS)
        .eq('user_id', userId).eq('dedupe_key', dedupeKey).maybeSingle();
      if (lookupError) throw fromDatabaseError(lookupError, 'Reminder');
      if (existing) {
        throw conflict('A reminder for this event already exists.', { reminder: presentReminder(existing) });
      }

      const { data: row, error } = await db.from('reminders').insert({
        user_id: userId,
        note_id: input.note_id || null,
        event_title: input.event_title,
        event_description: input.event_description || null,
        start_datetime: window.start.toUTC().toISO(),
        end_datetime: window.end.toUTC().toISO(),
        all_day: window.allDay,
        timezone: input.timezone,
        calendar_id: calendarId,
        calendar_name: calendarName,
        source_text: input.source_text || null,
        dedupe_key: dedupeKey,
        status: 'pending',
      }).select(COLUMNS).single();
      if (error) {
        if (error.code === '23505') throw conflict('A reminder for this event already exists.');
        throw fromDatabaseError(error, 'Reminder');
      }
      if (!input.sync) return presentReminder(row);
      return presentReminder(await pushToCalendar(db, userId, row));
    },

    /** Updates reminder fields and mirrors the change to Google Calendar. */
    async update(db, user, id, patch) {
      const userId = user.id;
      const current = await fetchReminder(db, userId, id);
      const local = toLocalFields(current);
      const merged = {
        start_date: patch.start_date ?? local.start_date,
        start_time: patch.start_time !== undefined ? patch.start_time : local.start_time,
        end_date: patch.end_date !== undefined ? patch.end_date : shiftDate(local.end_date, local.start_date, patch.start_date),
        end_time: patch.end_time !== undefined ? patch.end_time : local.end_time,
        all_day: patch.all_day ?? current.all_day,
        timezone: patch.timezone ?? current.timezone,
      };
      if (!merged.all_day && !merged.start_time) throw badRequest('Start time is required unless the event is all-day.');
      const window = windowOrThrow(merged);
      const title = patch.event_title ?? current.event_title;
      const changes = {
        event_title: title,
        event_description: patch.event_description !== undefined ? patch.event_description : current.event_description,
        start_datetime: window.start.toUTC().toISO(),
        end_datetime: window.end.toUTC().toISO(),
        all_day: window.allDay,
        timezone: merged.timezone,
        dedupe_key: dedupeKeyFor({ noteId: current.note_id, title, start: window.start }),
      };

      const movingCalendar = patch.calendar_id && patch.calendar_id !== current.calendar_id;
      if (movingCalendar && current.google_event_id) {
        // Move = delete from the old calendar, then create in the new one.
        await calendar.deleteEvent(userId, current.calendar_id, current.google_event_id);
        changes.google_event_id = null;
        changes.google_event_link = null;
        changes.status = 'pending';
      }
      if (patch.calendar_id !== undefined) {
        changes.calendar_id = patch.calendar_id;
        changes.calendar_name = patch.calendar_name ?? null;
      }

      let updated;
      try {
        updated = await writeReminder(db, userId, id, changes);
      } catch (error) {
        if (error.status === 409) throw conflict('Another reminder already exists for that time.');
        throw error;
      }
      const shouldSync = updated.calendar_id && (current.status === 'synced' || current.status === 'failed' || movingCalendar || current.google_event_id);
      if (!shouldSync) return presentReminder(updated);
      return presentReminder(await pushToCalendar(db, userId, updated));
    },

    /** Retries (or performs the first) sync of a reminder to Google Calendar. */
    async sync(db, user, id) {
      const row = await fetchReminder(db, user.id, id);
      return presentReminder(await pushToCalendar(db, user.id, row));
    },

    /** Fetches the live Google event for a synced reminder. */
    async getCalendarEvent(db, user, id) {
      const row = await fetchReminder(db, user.id, id);
      if (!row.google_event_id) throw new AppError('This reminder is not on Google Calendar yet.', { status: 409, code: 'not_synced', recovery: 'retry' });
      const event = await calendar.getEvent(user.id, row.calendar_id, row.google_event_id);
      return { reminder: presentReminder(row), event: { id: event.id, status: event.status, summary: event.summary, start: event.start, end: event.end, html_link: event.htmlLink, updated: event.updated } };
    },

    /** Removes the Google event but keeps the reminder (status back to pending). */
    async unlinkCalendarEvent(db, user, id) {
      const row = await fetchReminder(db, user.id, id);
      if (row.google_event_id) await calendar.deleteEvent(user.id, row.calendar_id, row.google_event_id);
      return presentReminder(await writeReminder(db, user.id, id, {
        google_event_id: null, google_event_link: null, status: 'pending', sync_error: null,
      }));
    },

    /**
     * Deletes the reminder. The Google event is deleted first; if Google
     * fails, the reminder is kept so nothing is orphaned silently.
     * Pass `keepEvent` to only remove the association.
     */
    async remove(db, user, id, { keepEvent = false } = {}) {
      const row = await fetchReminder(db, user.id, id);
      let calendarResult = null;
      if (row.google_event_id && !keepEvent) {
        try {
          calendarResult = await calendar.deleteEvent(user.id, row.calendar_id, row.google_event_id);
        } catch (error) {
          if (error.code !== 'calendar_not_connected' && error.code !== 'calendar_reauth_required') throw error;
          throw new AppError('Reconnect Google Calendar to delete the event, or remove only the reminder.', {
            status: error.status, code: error.code, recovery: 'connect_calendar', details: { can_keep_event: true },
          });
        }
      }
      const { error } = await db.from('reminders').delete().eq('user_id', user.id).eq('id', id);
      if (error) throw fromDatabaseError(error, 'Reminder');
      return { id, calendar_event_deleted: Boolean(calendarResult?.deleted), event_kept: keepEvent && Boolean(row.google_event_id) };
    },
  };
}
