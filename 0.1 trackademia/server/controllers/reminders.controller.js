/** HTTP handlers for /api/reminders. */
export function createRemindersController({ reminders }) {
  return {
    async list(req, res) {
      res.json({ data: await reminders.list(req.db, req.user.id, req.valid.query) });
    },
    async get(req, res) {
      res.json({ data: await reminders.get(req.db, req.user.id, req.valid.params.id) });
    },
    async create(req, res) {
      res.status(201).json({ data: await reminders.create(req.db, req.user, req.valid.body) });
    },
    async update(req, res) {
      res.json({ data: await reminders.update(req.db, req.user, req.valid.params.id, req.valid.body) });
    },
    async sync(req, res) {
      res.json({ data: await reminders.sync(req.db, req.user, req.valid.params.id) });
    },
    async remove(req, res) {
      const keepEvent = req.query.keep_event === 'true';
      res.json({ data: await reminders.remove(req.db, req.user, req.valid.params.id, { keepEvent }) });
    },
  };
}
