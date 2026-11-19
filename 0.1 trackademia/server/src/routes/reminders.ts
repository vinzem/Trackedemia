import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthReq } from '../middleware/auth';
import { createEvent, updateEvent, deleteEvent, eventInput } from '../services/calendar';
const r = Router(); const inc = { note: { select: { id: true, title: true, category: { select: { color: true } } } } };
r.get('/', async (q: AuthReq, res) => { const { from, to } = q.query as any;
  res.json(await prisma.reminder.findMany({ where: { userId: q.userId, ...(from && to && { date: { gte: from, lte: to } }) }, include: inc, orderBy: [{ date: 'asc' }, { time: 'asc' }] })); });
r.get('/:id', async (q: AuthReq, res) => { const x = await prisma.reminder.findFirst({ where: { id: q.params.id, userId: q.userId }, include: inc }); x ? res.json(x) : res.status(404).json({ error: 'Not found' }); });
// Creating a reminder also creates its calendar event, so the two never drift apart.
r.post('/', async (q: AuthReq, res, n) => { try { const { event } = await createEvent(q.userId!, eventInput.parse(q.body)); res.status(201).json(await prisma.reminder.findUnique({ where: { calendarEventId: event.id }, include: inc })); } catch (e) { n(e); } });
r.put('/:id', async (q: AuthReq, res, n) => { try {
  const x = await prisma.reminder.findFirst({ where: { id: q.params.id, userId: q.userId } }); if (!x) return res.status(404).json({ error: 'Not found' });
  const d = eventInput.omit({ idempotencyKey: true }).partial().parse(q.body);
  if (x.calendarEventId) await updateEvent(q.userId!, x.calendarEventId, d); else await prisma.reminder.update({ where: { id: x.id }, data: d });
  res.json(await prisma.reminder.findUnique({ where: { id: x.id }, include: inc })); } catch (e) { n(e); } });
r.delete('/:id', async (q: AuthReq, res, n) => { try {
  const x = await prisma.reminder.findFirst({ where: { id: q.params.id, userId: q.userId } }); if (!x) return res.status(404).json({ error: 'Not found' });
  if (x.calendarEventId) await deleteEvent(q.userId!, x.calendarEventId); else await prisma.reminder.delete({ where: { id: x.id } });
  res.json({ ok: true }); } catch (e) { n(e); } });
export default r;
