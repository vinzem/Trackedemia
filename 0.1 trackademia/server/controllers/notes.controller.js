/** HTTP handlers for /api/notes. Business logic lives in notes.service. */
import * as notes from '../services/notes.service.js';
import { getProfile } from '../services/profile.service.js';

export function createNotesController({ services }) {
  async function syncCalendar(req, note, requestedTimezone) {
    const profile = await getProfile(req.db, req.user);
    const timezone = requestedTimezone || profile.timezone;
    const extracted = await services.extraction.extract({
      text: note.content,
      timezone,
      allowAi: profile.ai_detection_enabled !== false,
    });
    await services.reminders.syncNoteEvents(req.db, req.user, note, extracted.events, timezone);
    return notes.getNote(req.db, req.user.id, note.id);
  }

  return {
    async list(req, res) {
      const { notes: items, total } = await notes.listNotes(req.db, req.user.id, req.valid.query);
      res.json({ data: items, meta: { total, limit: req.valid.query.limit, offset: req.valid.query.offset } });
    },
    async get(req, res) {
      res.json({ data: await notes.getNote(req.db, req.user.id, req.valid.params.id) });
    },
    async create(req, res) {
      const note = await notes.createNote(req.db, req.user.id, req.valid.body);
      const synced = await syncCalendar(req, note, req.valid.body.timezone);
      res.status(201).json({ data: synced });
    },
    async update(req, res) {
      const note = await notes.updateNote(req.db, req.user.id, req.valid.params.id, req.valid.body);
      const synced = await syncCalendar(req, note, req.valid.body.timezone);
      res.json({ data: synced });
    },
    async remove(req, res) {
      res.json({ data: await notes.deleteNote(req.db, req.user.id, req.valid.params.id) });
    },
  };
}
