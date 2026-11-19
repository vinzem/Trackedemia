/** HTTP handlers for /api/notes. Business logic lives in notes.service. */
import * as notes from '../services/notes.service.js';

export const notesController = {
  async list(req, res) {
    const { notes: items, total } = await notes.listNotes(req.db, req.user.id, req.valid.query);
    res.json({ data: items, meta: { total, limit: req.valid.query.limit, offset: req.valid.query.offset } });
  },
  async get(req, res) {
    res.json({ data: await notes.getNote(req.db, req.user.id, req.valid.params.id) });
  },
  async create(req, res) {
    res.status(201).json({ data: await notes.createNote(req.db, req.user.id, req.valid.body) });
  },
  async update(req, res) {
    res.json({ data: await notes.updateNote(req.db, req.user.id, req.valid.params.id, req.valid.body) });
  },
  async remove(req, res) {
    res.json({ data: await notes.deleteNote(req.db, req.user.id, req.valid.params.id) });
  },
};
