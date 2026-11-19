import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthReq } from '../middleware/auth';
import { subscribe, connections } from '../services/realtime';
import { createEvent, updateEvent, deleteEvent, eventInput, include } from '../services/calendar';
const r = Router(); const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
r.get('/status', (q: AuthReq, res) => res.json({ realtime: 'available', activeConnections: connections(q.userId!) }));
r.get('/stream', (q: AuthReq, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write('retry: 3000\n\n');
  const off = subscribe(q.userId!, res); const hb = setInterval(() => res.write(': ping\n\n'), 25000);
  q.on('close', () => { clearInterval(hb); off(); });
});
r.get('/events', async (q: AuthReq, res, n) => { try {
  const { start, end } = z.object({ start: day, end: day }).parse(q.query);
  res.json(await prisma.calendarEvent.findMany({ where: { userId: q.userId, date: { gte: start, lte: end } }, include, orderBy: [{ date: 'asc' }, { time: 'asc' }] })); } catch (e) { n(e); } });
r.post('/events', async (q: AuthReq, res, n) => { try { const { event, created } = await createEvent(q.userId!, eventInput.parse(q.body)); res.status(created ? 201 : 200).json(event); } catch (e) { n(e); } });
r.put('/events/:id', async (q: AuthReq, res, n) => { try { res.json(await updateEvent(q.userId!, q.params.id, eventInput.omit({ idempotencyKey: true }).partial().parse(q.body))); } catch (e) { n(e); } });
r.delete('/events/:id', async (q: AuthReq, res, n) => { try { await deleteEvent(q.userId!, q.params.id); res.json({ ok: true }); } catch (e) { n(e); } });
export default r;
