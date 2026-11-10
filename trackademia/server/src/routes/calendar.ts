import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthReq } from '../middleware/auth';
import { wrap, eventBody, authUrl } from '../services/google';
const r = Router(); const ev = z.object({ title: z.string().min(1), date: z.string(), time: z.string(), timeZone: z.string().default('UTC') });
r.get('/status', async (q: AuthReq, res) => { const a = await prisma.googleAccount.findUnique({ where: { userId: q.userId } }); res.json({ connected: !!a?.calendarConnected }); });
r.post('/connect', (_q, res) => res.json({ url: authUrl() })); // frontend navigates here; callback stores encrypted tokens
r.post('/disconnect', async (q: AuthReq, res) => { await prisma.googleAccount.updateMany({ where: { userId: q.userId }, data: { calendarConnected: false } }); res.json({ ok: true }); });
r.get('/events', async (q: AuthReq, res, n) => { try { const { from, to } = q.query as any;
  const d = await wrap(q.userId!, c => c.events.list({ calendarId: 'primary', singleEvents: true, orderBy: 'startTime', timeMin: from && new Date(from).toISOString(), timeMax: to && new Date(to).toISOString(), maxResults: 250 })); res.json(d.data.items); } catch (e) { n(e); } });
r.post('/events', async (q: AuthReq, res, n) => { try { res.status(201).json((await wrap(q.userId!, c => c.events.insert({ calendarId: 'primary', requestBody: eventBody(ev.parse(q.body)) }))).data); } catch (e) { n(e); } });
r.put('/events/:id', async (q: AuthReq, res, n) => { try { res.json((await wrap(q.userId!, c => c.events.patch({ calendarId: 'primary', eventId: q.params.id, requestBody: eventBody(ev.parse(q.body)) }))).data); } catch (e) { n(e); } });
r.delete('/events/:id', async (q: AuthReq, res, n) => { try { await wrap(q.userId!, c => c.events.delete({ calendarId: 'primary', eventId: q.params.id })); res.json({ ok: true }); } catch (e) { n(e); } });
export default r;
