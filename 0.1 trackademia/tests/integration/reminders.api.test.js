import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const EVENT = {
  event_title: 'Dentist appointment',
  event_description: 'Bring insurance card',
  start_date: '2026-11-04',
  start_time: '10:00',
  timezone: 'Asia/Manila',
};

describe('first-party calendar events API', () => {
  let ctx;
  let user;
  let noteId;
  beforeEach(async () => {
    ctx = createTestContext();
    user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000d1' });
    const note = await request(ctx.app).post('/api/notes').set(user.auth).send({ title: 'Errands', content: 'Things to take care of this week.' });
    noteId = note.body.data.id;
  });
  const createEvent = (body = {}) => request(ctx.app).post('/api/reminders').set(user.auth).send({ ...EVENT, ...body });

  it('saves an event to Trackademia without calling Google Calendar', async () => {
    const res = await createEvent({ note_id: noteId }).expect(201);
    expect(res.body.data).toMatchObject({
      event_title: 'Dentist appointment',
      status: 'saved',
      start_datetime: '2026-11-04T02:00:00.000Z',
      local: { start_date: '2026-11-04', start_time: '10:00', end_time: '11:00' },
    });
    expect(res.body.data.note).toMatchObject({ id: noteId, title: 'Errands', preview: 'Things to take care of this week.' });
    expect(ctx.google.activeEvents()).toHaveLength(0);
    expect(ctx.supabase.store.tables.reminders[0]).toMatchObject({ user_id: user.id, note_id: noteId });
  });

  it('lists only events inside the requested date range', async () => {
    await createEvent({ start_date: '2026-11-04' }).expect(201);
    await createEvent({ event_title: 'December event', start_date: '2026-12-02' }).expect(201);
    const res = await request(ctx.app).get('/api/reminders')
      .query({ from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:59:59.999Z' })
      .set(user.auth).expect(200);
    expect(res.body.data.map((event) => event.event_title)).toEqual(['Dentist appointment']);
  });

  it('updates the stored event fields', async () => {
    const { body } = await createEvent({ note_id: noteId });
    const updated = await request(ctx.app).patch(`/api/reminders/${body.data.id}`).set(user.auth)
      .send({ event_title: 'Dentist (moved)', start_date: '2026-11-05', start_time: '14:30', end_time: '15:15' }).expect(200);
    expect(updated.body.data).toMatchObject({
      event_title: 'Dentist (moved)',
      status: 'saved',
      local: { start_date: '2026-11-05', start_time: '14:30', end_time: '15:15' },
    });
    expect(ctx.google.activeEvents()).toHaveLength(0);
  });

  it('supports all-day events', async () => {
    const res = await createEvent({ event_title: 'Pay electricity bill', start_date: '2026-11-15', start_time: null, all_day: true }).expect(201);
    expect(res.body.data.local).toMatchObject({ start_date: '2026-11-15', end_date: '2026-11-15', start_time: null });
  });

  it('deletes an event from the first-party calendar', async () => {
    const { body } = await createEvent();
    await request(ctx.app).delete(`/api/reminders/${body.data.id}`).set(user.auth).expect(200);
    await request(ctx.app).get(`/api/reminders/${body.data.id}`).set(user.auth).expect(404);
  });

  it('validates input and enforces event ownership', async () => {
    for (const [patch, path] of [[{ event_title: '' }, 'event_title'], [{ start_date: '2026-13-40' }, 'start_date'], [{ timezone: 'Nowhere/City' }, 'timezone'], [{ note_id: 'abc' }, 'note_id']]) {
      const res = await createEvent(patch);
      expect(res.status, path).toBe(400);
      expect(res.body.error.details.some((detail) => detail.path === path), path).toBe(true);
    }

    const { body } = await createEvent();
    const other = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000d2' });
    await request(ctx.app).get(`/api/reminders/${body.data.id}`).set(other.auth).expect(404);
    await request(ctx.app).delete(`/api/reminders/${body.data.id}`).set(other.auth).expect(404);
    await request(ctx.app).get('/api/reminders').set(other.auth).expect(200).expect((res) => expect(res.body.data).toHaveLength(0));
  });

  it('does not expose Google Calendar sync endpoints', async () => {
    await request(ctx.app).get('/api/calendar/status').set(user.auth).expect(404);
    await request(ctx.app).post('/api/reminders/00000000-0000-4000-8000-000000000001/sync').set(user.auth).expect(404);
  });
});
