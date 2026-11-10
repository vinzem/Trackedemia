import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthReq } from '../middleware/auth';
import { wrap, eventBody } from '../services/google';
const r = Router();
const body = z.object({ title: z.string().trim().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: z.string().default('UTC'), noteId: z.string().nullable().optional(), addToGoogle: z.boolean().default(true) });
const own = (q: AuthReq) => ({ id: q.params.id, userId: q.userId });
r.get('/', async (q: AuthReq, res) => { const { from, to } = q.query as any;
  res.json(await prisma.reminder.findMany({ where: { userId: q.userId, ...(from && to && { date: { gte: from, lte: to } }) }, include: { note: { select: { id: true, title: true, category: { select: { color: true } } } } }, orderBy: [{ date: 'asc' }, { time: 'asc' }] })); });
r.get('/:id', async (q: AuthReq, res) => { const x = await prisma.reminder.findFirst({ where: own(q) }); x ? res.json(x) : res.status(404).json({ error: 'Not found' }); });
r.post('/', async (q: AuthReq, res, n) => { try {
  const { addToGoogle, ...d } = body.parse(q.body);
  if (d.noteId && !(await prisma.note.findFirst({ where: { id: d.noteId, userId: q.userId } }))) return res.status(400).json({ error: 'Invalid note' });
  let googleEventId: string | undefined;
  if (addToGoogle) googleEventId = (await wrap(q.userId!, c => c.events.insert({ calendarId: 'primary', requestBody: eventBody(d) }))).data.id;
  res.status(201).json(await prisma.reminder.create({ data: { ...d, userId: q.userId!, googleEventId, status: googleEventId ? 'synced' : 'scheduled' } })); } catch (e) { n(e); } });
r.put('/:id', async (q: AuthReq, res, n) => { try {
  const x = await prisma.reminder.findFirst({ where: own(q) }); if (!x) return res.status(404).json({ error: 'Not found' });
  const d = body.omit({ addToGoogle: true }).partial().parse(q.body);
  if (x.googleEventId) await wrap(q.userId!, c => c.events.patch({ calendarId: 'primary', eventId: x.googleEventId, requestBody: eventBody({ ...x, ...d }) }));
  res.json(await prisma.reminder.update({ where: { id: x.id }, data: d })); } catch (e) { n(e); } });
r.delete('/:id', async (q: AuthReq, res, n) => { try {
  const x = await prisma.reminder.findFirst({ where: own(q) }); if (!x) return res.status(404).json({ error: 'Not found' });
  if (x.googleEventId) await wrap(q.userId!, c => c.events.delete({ calendarId: 'primary', eventId: x.googleEventId })).catch((e: any) => { if (e.status !== 404) throw e; });
  await prisma.reminder.delete({ where: { id: x.id } }); res.json({ ok: true }); } catch (e) { n(e); } });
export default r;
