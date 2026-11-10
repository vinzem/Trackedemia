import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthReq } from '../middleware/auth';
const r = Router(); const body = z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });
r.get('/', async (q: AuthReq, res) => {
  const cats = await prisma.category.findMany({ where: { userId: q.userId }, include: { _count: { select: { notes: true } } }, orderBy: { createdAt: 'asc' } });
  res.json(cats.map(({ _count, ...c }) => ({ ...c, noteCount: _count.notes })));
});
r.post('/', async (q: AuthReq, res, n) => { try { res.status(201).json(await prisma.category.create({ data: { ...body.parse(q.body), userId: q.userId! } })); } catch (e) { n(e); } });
r.put('/:id', async (q: AuthReq, res, n) => { try {
  const x = await prisma.category.updateMany({ where: { id: q.params.id, userId: q.userId }, data: body.partial().parse(q.body) });
  x.count ? res.json(await prisma.category.findUnique({ where: { id: q.params.id } })) : res.status(404).json({ error: 'Not found' }); } catch (e) { n(e); } });
r.delete('/:id', async (q: AuthReq, res, n) => { try { const x = await prisma.category.deleteMany({ where: { id: q.params.id, userId: q.userId } }); x.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' }); } catch (e) { n(e); } });
export default r;
