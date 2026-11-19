import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { broadcast } from './realtime';
const err = (status: number, m: string) => Object.assign(new Error(m), { status });
export const eventInput = z.object({
  title: z.string().trim().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().max(64).default('UTC'), noteId: z.string().nullable().optional(), idempotencyKey: z.string().max(100).optional(),
});
export type EventInput = z.infer<typeof eventInput>;
export const include = { reminder: { select: { id: true, status: true } }, note: { select: { id: true, title: true, category: { select: { color: true } } } } };

// Persist event + reminder atomically, THEN broadcast. A repeated idempotencyKey returns the original event.
export async function createEvent(userId: string, d: EventInput) {
  if (d.noteId && !(await prisma.note.findFirst({ where: { id: d.noteId, userId } }))) throw err(400, 'Invalid note');
  const existing = () => d.idempotencyKey ? prisma.calendarEvent.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: d.idempotencyKey } }, include }) : null;
  const dup = await existing(); if (dup) return { event: dup, created: false };
  try {
    const id = await prisma.$transaction(async tx => {
      const e = await tx.calendarEvent.create({ data: { title: d.title, date: d.date, time: d.time, timeZone: d.timeZone, noteId: d.noteId ?? null, idempotencyKey: d.idempotencyKey, userId } });
      await tx.reminder.create({ data: { title: d.title, date: d.date, time: d.time, timeZone: d.timeZone, noteId: d.noteId ?? null, userId, calendarEventId: e.id } });
      return e.id;
    });
    const event = await prisma.calendarEvent.findUniqueOrThrow({ where: { id }, include });
    broadcast(userId, 'created', { event }); return { event, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') { const x = await existing(); if (x) return { event: x, created: false }; }
    throw e;
  }
}
export async function updateEvent(userId: string, id: string, d: Partial<Omit<EventInput, 'idempotencyKey'>>) {
  if (d.noteId && !(await prisma.note.findFirst({ where: { id: d.noteId, userId } }))) throw err(400, 'Invalid note');
  const { idempotencyKey, ...data } = d as any;
  const ok = await prisma.$transaction(async tx => {
    const u = await tx.calendarEvent.updateMany({ where: { id, userId }, data });
    if (u.count) await tx.reminder.updateMany({ where: { calendarEventId: id, userId }, data });
    return u.count;
  });
  if (!ok) throw err(404, 'Event not found');
  const event = await prisma.calendarEvent.findUniqueOrThrow({ where: { id }, include });
  broadcast(userId, 'updated', { event }); return event;
}
export async function deleteEvent(userId: string, id: string) {
  const r = await prisma.calendarEvent.deleteMany({ where: { id, userId } }); // cascades to reminder
  if (!r.count) throw err(404, 'Event not found');
  broadcast(userId, 'deleted', { id });
}
