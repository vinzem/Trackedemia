import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthReq } from '../middleware/auth';
import { wrap } from '../services/google';
const r = Router();
const body = z.object({ title: z.string().max(200).default(''), content: z.string().max(200000).default(''), categoryId: z.string().nullable().optional() });
const include = { category: true, reminders: { select: { id: true, date: true, time: true, status: true } } };
const ownsCat = async (userId: string, id?: string | null) => !id || !!(await prisma.category.findFirst({ where: { id, userId } }));
r.get('/', async (q: AuthReq, res, n) => { try {
  const { q: s, categoryId, sort, order, page, limit } = z.object({ q: z.string().optional(), categoryId: z.string().optional(), sort: z.enum(['createdAt', 'updatedAt']).default('updatedAt'), order: z.enum(['asc', 'desc']).default('desc'), page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(50) }).parse(q.query);
  const where: any = { userId: q.userId, ...(categoryId && { categoryId }), ...(s && { OR: [{ title: { contains: s, mode: 'insensitive' } }, { content: { contains: s, mode: 'insensitive' } }, { category: { name: { contains: s, mode: 'insensitive' } } }] }) };
  const [total, notes] = await Promise.all([prisma.note.count({ where }), prisma.note.findMany({ where, include, orderBy: { [sort]: order }, skip: (page - 1) * limit, take: limit })]);
  res.json({ total, page, notes }); } catch (e) { n(e); } });
r.get('/:id', async (q: AuthReq, res) => { const x = await prisma.note.findFirst({ where: { id: q.params.id, userId: q.userId }, include }); x ? res.json(x) : res.status(404).json({ error: 'Not found' }); });
r.post('/', async (q: AuthReq, res, n) => { try { const d = body.parse(q.body);
  if (!(await ownsCat(q.userId!, d.categoryId))) return res.status(400).json({ error: 'Invalid category' });
  res.status(201).json(await prisma.note.create({ data: { ...d, userId: q.userId! }, include })); } catch (e) { n(e); } });
r.put('/:id', async (q: AuthReq, res, n) => { try { const d = body.partial().parse(q.body);
  if (!(await ownsCat(q.userId!, d.categoryId))) return res.status(400).json({ error: 'Invalid category' });
  const u = await prisma.note.updateMany({ where: { id: q.params.id, userId: q.userId }, data: d });
  u.count ? res.json(await prisma.note.findUnique({ where: { id: q.params.id }, include })) : res.status(404).json({ error: 'Not found' }); } catch (e) { n(e); } });
r.delete('/:id', async (q: AuthReq, res, n) => { try {
  const rem = await prisma.reminder.findMany({ where: { noteId: q.params.id, userId: q.userId, googleEventId: { not: null } } });
  for (const x of rem) await wrap(q.userId!, c => c.events.delete({ calendarId: 'primary', eventId: x.googleEventId })).catch(() => {});
  const d = await prisma.note.deleteMany({ where: { id: q.params.id, userId: q.userId } }); d.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' }); } catch (e) { n(e); } });
export default r;
