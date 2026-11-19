/** Reminder records are the source of truth for the user's first-party calendar. */
import { DateTime } from 'luxon';
import { badRequest, conflict, fromDatabaseError, notFound } from '../utils/errors.js';
import { hashKey } from '../utils/crypto.js';
import { toEventWindow, toLocalFields } from '../utils/date-parser.js';

const COLUMNS = 'id, user_id, note_id, event_title, event_description, start_datetime, end_datetime, all_day, timezone, source_text, created_at, updated_at';

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

export function createRemindersService() {
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

  function normalizedTitle(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async function assertNoteOwned(db, userId, noteId) {
    if (!noteId) return;
    const { data, error } = await db.from('notes').select('id').eq('user_id', userId).eq('id', noteId).maybeSingle();
    if (error) throw fromDatabaseError(error, 'Note');
    if (!data) throw notFound('Note');
  }

  async function includeNotes(db, userId, rows) {
    const noteIds = [...new Set(rows.map((row) => row.note_id).filter(Boolean))];
    if (!noteIds.length) return rows.map((row) => ({ ...row, note: null }));
    const { data, error } = await db.from('notes').select('id, title, content').eq('user_id', userId).in('id', noteIds);
    if (error) throw fromDatabaseError(error, 'Note');
    const notes = new Map((data || []).map((note) => [note.id, {
      id: note.id,
      title: note.title,
      preview: String(note.content || '').trim().slice(0, 320),
    }]));
    return rows.map((row) => ({ ...row, note: notes.get(row.note_id) || null }));
  }

  async function presentWithNotes(db, userId, rows) {
    const withNotes = await includeNotes(db, userId, rows);
    return withNotes.map((row) => presentReminder({ ...row, status: 'saved' }));
  }

  return {
    async list(db, userId, { note_id: noteId, from, to, limit = 100 } = {}) {
      let query = db.from('reminders').select(COLUMNS).eq('user_id', userId);
      if (noteId) query = query.eq('note_id', noteId);
      if (from) query = query.gte('start_datetime', from);
      if (to) query = query.lte('start_datetime', to);
      const { data, error } = await query.order('start_datetime', { ascending: true }).limit(limit);
      if (error) throw fromDatabaseError(error, 'Reminders');
      return presentWithNotes(db, userId, data || []);
    },

    async get(db, userId, id) {
      return (await presentWithNotes(db, userId, [await fetchReminder(db, userId, id)]))[0];
    },

    /**
     * Saves an event to the user's calendar. Duplicate attempts for the same
     * note/title/start return 409 with the existing reminder.
     */
    async create(db, user, input) {
      const userId = user.id;
      await assertNoteOwned(db, userId, input.note_id);
      const window = windowOrThrow(input);

      const dedupeKey = dedupeKeyFor({ noteId: input.note_id, title: input.event_title, start: window.start });
      const { data: existing, error: lookupError } = await db.from('reminders').select(COLUMNS)
        .eq('user_id', userId).eq('dedupe_key', dedupeKey).maybeSingle();
      if (lookupError) throw fromDatabaseError(lookupError, 'Reminder');
      if (existing) {
        const [reminder] = await presentWithNotes(db, userId, [existing]);
        throw conflict('A reminder for this event already exists.', { reminder });
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
        source_text: input.source_text || null,
        dedupe_key: dedupeKey,
        status: 'pending',
      }).select(COLUMNS).single();
      if (error) {
        if (error.code === '23505') throw conflict('A reminder for this event already exists.');
        throw fromDatabaseError(error, 'Reminder');
      }
      return (await presentWithNotes(db, userId, [row]))[0];
    },

    /** Updates a saved calendar event. */
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
        source_text: patch.source_text !== undefined ? patch.source_text : current.source_text,
        start_datetime: window.start.toUTC().toISO(),
        end_datetime: window.end.toUTC().toISO(),
        all_day: window.allDay,
        timezone: merged.timezone,
        dedupe_key: dedupeKeyFor({ noteId: current.note_id, title, start: window.start }),
      };

      let updated;
      try {
        updated = await writeReminder(db, userId, id, changes);
      } catch (error) {
        if (error.status === 409) throw conflict('Another reminder already exists for that time.');
        throw error;
      }
      return (await presentWithNotes(db, userId, [updated]))[0];
    },

    /** Keeps note-linked calendar events aligned with the note's detected dates. */
    async syncNoteEvents(db, user, note, detectedEvents, timezone) {
      const { data: linked, error } = await db.from('reminders').select(COLUMNS)
        .eq('user_id', user.id).eq('note_id', note.id).order('start_datetime', { ascending: true });
      if (error) throw fromDatabaseError(error, 'Reminders');

      const candidates = detectedEvents.filter((event) => event.start_date && !event.is_past
        && !event.clarification && !event.time_hint);
      const unmatched = new Set((linked || []).map((row) => row.id));
      const assignments = new Map();
      const remaining = [...candidates];

      for (const event of candidates) {
        const row = (linked || []).find((item) => unmatched.has(item.id)
          && item.source_text && item.source_text === event.source_text);
        if (row) {
          assignments.set(event, row);
          unmatched.delete(row.id);
          remaining.splice(remaining.indexOf(event), 1);
        }
      }
      for (const event of [...remaining]) {
        const title = normalizedTitle(event.event_title);
        const row = (linked || []).find((item) => unmatched.has(item.id)
          && normalizedTitle(item.event_title) === title);
        if (row) {
          assignments.set(event, row);
          unmatched.delete(row.id);
          remaining.splice(remaining.indexOf(event), 1);
        }
      }
      if (remaining.length === 1 && unmatched.size === 1) {
        const row = (linked || []).find((item) => unmatched.has(item.id));
        assignments.set(remaining[0], row);
        unmatched.delete(row.id);
        remaining.length = 0;
      }

      for (const event of candidates) {
        const input = {
          event_title: (event.event_title || 'Calendar event').slice(0, 200),
          event_description: event.event_description ? event.event_description.slice(0, 5000) : null,
          start_date: event.start_date,
          start_time: event.start_time || null,
          end_date: event.end_date || null,
          end_time: event.end_time || null,
          all_day: !event.start_time,
          timezone: event.timezone || timezone,
          source_text: event.source_text ? event.source_text.slice(0, 500) : null,
        };
        const existing = assignments.get(event);
        if (existing) await this.update(db, user, existing.id, input);
        else await this.create(db, user, { ...input, note_id: note.id });
      }

      for (const row of linked || []) {
        if (unmatched.has(row.id)) await this.remove(db, user, row.id);
      }
    },

    async remove(db, user, id) {
      await fetchReminder(db, user.id, id);
      const { error } = await db.from('reminders').delete().eq('user_id', user.id).eq('id', id);
      if (error) throw fromDatabaseError(error, 'Reminder');
      return { id };
    },
  };
}
