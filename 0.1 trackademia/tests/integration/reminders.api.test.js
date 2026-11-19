import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { connectCalendar } from '../helpers/connect.js';
import { createTestContext } from '../helpers/test-app.js';

const REMINDER = {
  event_title: 'Dentist appointment',
  event_description: 'Bring insurance card',
  start_date: '2026-11-04',
  start_time: '10:00',
  timezone: 'Asia/Manila',
  calendar_id: 'primary-cal@example.com',
  calendar_name: 'Student',
};

describe('reminders API + Google Calendar sync', () => {
  let ctx;
  let user;
  let noteId;
  beforeEach(async () => {
    ctx = createTestContext();
    user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000d1' });
    const note = await request(ctx.app).post('/api/notes').set(user.auth).send({ title: 'Errands', content: 'Dentist appointment tomorrow at 10am.' });
    noteId = note.body.data.id;
  });
  const createReminder = (body = {}) => request(ctx.app).post('/api/reminders').set(user.auth).send({ ...REMINDER, note_id: noteId, ...body });

  it('creates a real calendar event, stores its id and links it to the note', async () => {
    await connectCalendar(ctx, user);
    const res = await createReminder().expect(201);
    const reminder = res.body.data;
    expect(reminder.status).toBe('synced');
    expect(reminder.google_event_id).toMatch(/^tk[0-9a-f]{32}$/);
    expect(reminder.google_event_link).toContain('google.com/calendar');
    expect(reminder.start_datetime).toBe('2026-11-04T02:00:00.000Z'); // 10:00 Manila = 02:00 UTC
    expect(reminder.local).toMatchObject({ start_date: '2026-11-04', start_time: '10:00', end_time: '11:00' });

    const [event] = ctx.google.activeEvents();
    expect(event).toMatchObject({ summary: 'Dentist appointment', start: { dateTime: '2026-11-04T10:00:00', timeZone: 'Asia/Manila' } });
    expect(event.description).toContain(`/notes/${noteId}`);

    const note = await request(ctx.app).get(`/api/notes/${noteId}`).set(user.auth);
    expect(note.body.data.reminders[0]).toMatchObject({ id: reminder.id, status: 'synced' });
  });

  it('prevents duplicate events for the same note, title and time', async () => {
    await connectCalendar(ctx, user);
    await createReminder().expect(201);
    const dup = await createReminder();
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.reminder.status).toBe('synced');
    expect(ctx.google.activeEvents()).toHaveLength(1);
  });

  it('marks the reminder failed when the calendar is not connected, then syncs on retry', async () => {
    const res = await createReminder();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'calendar_not_connected', recovery: 'connect_calendar' });
    const [stored] = ctx.supabase.store.tables.reminders;
    expect(stored.status).toBe('failed');
    expect(stored.google_event_id).toBeUndefined();

    await connectCalendar(ctx, user);
    const retry = await request(ctx.app).post(`/api/reminders/${stored.id}/sync`).set(user.auth).expect(200);
    expect(retry.body.data.status).toBe('synced');
    expect(ctx.google.activeEvents()).toHaveLength(1);
  });

  it('never reports success when Google fails, and a retry does not duplicate', async () => {
    await connectCalendar(ctx, user);
    ctx.google.state.failures.push({ match: /POST .*\/events$/, status: 500 });
    const res = await createReminder();
    expect(res.status).toBe(503);
    const id = ctx.supabase.store.tables.reminders[0].id;
    const failed = await request(ctx.app).get(`/api/reminders/${id}`).set(user.auth);
    expect(failed.body.data.status).toBe('failed');
    expect(failed.body.data.sync_error).toContain('temporarily unavailable');

    await request(ctx.app).post('/api/calendar/events').set(user.auth).send({ reminder_id: id }).expect(201);
    await request(ctx.app).post('/api/calendar/events').set(user.auth).send({ reminder_id: id }).expect(201);
    expect(ctx.google.activeEvents()).toHaveLength(1);
  });

  it('edits a reminder and updates the Google event', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    const res = await request(ctx.app).patch(`/api/reminders/${body.data.id}`).set(user.auth)
      .send({ event_title: 'Dentist (moved)', start_date: '2026-11-05', start_time: '14:30', end_time: '15:15' }).expect(200);
    expect(res.body.data).toMatchObject({ event_title: 'Dentist (moved)', status: 'synced' });
    expect(res.body.data.local).toMatchObject({ start_date: '2026-11-05', start_time: '14:30', end_time: '15:15' });
    const [event] = ctx.google.activeEvents();
    expect(event).toMatchObject({ summary: 'Dentist (moved)', start: { dateTime: '2026-11-05T14:30:00' }, end: { dateTime: '2026-11-05T15:15:00' } });
  });

  it('moves an event between calendars', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    const res = await request(ctx.app).patch(`/api/reminders/${body.data.id}`).set(user.auth)
      .send({ calendar_id: 'school@group.calendar.google.com', calendar_name: 'School' }).expect(200);
    expect(res.body.data).toMatchObject({ calendar_name: 'School', status: 'synced' });
    const active = [...ctx.google.state.events.entries()].filter(([, e]) => e.status !== 'cancelled').map(([k]) => k);
    expect(active).toEqual([`school@group.calendar.google.com|${res.body.data.google_event_id}`]);
  });

  it('recreates the event if it was deleted directly in Google Calendar', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    ctx.google.state.events.clear();
    const res = await request(ctx.app).patch(`/api/reminders/${body.data.id}`).set(user.auth).send({ event_title: 'Back again' }).expect(200);
    expect(res.body.data.status).toBe('synced');
    expect(ctx.google.activeEvents()[0].summary).toBe('Back again');
  });

  it('supports all-day reminders', async () => {
    await connectCalendar(ctx, user);
    const res = await createReminder({ event_title: 'Pay electricity bill', start_date: '2026-11-15', start_time: null, all_day: true }).expect(201);
    expect(res.body.data.local).toMatchObject({ start_date: '2026-11-15', end_date: '2026-11-15', start_time: null });
    expect(ctx.google.activeEvents()[0]).toMatchObject({ start: { date: '2026-11-15' }, end: { date: '2026-11-16' } });
  });

  it('deletes a reminder together with its Google event (undo)', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    const res = await request(ctx.app).delete(`/api/reminders/${body.data.id}`).set(user.auth).expect(200);
    expect(res.body.data.calendar_event_deleted).toBe(true);
    expect(ctx.google.activeEvents()).toHaveLength(0);
    await request(ctx.app).get(`/api/reminders/${body.data.id}`).set(user.auth).expect(404);
  });

  it('can remove the Google event but keep the reminder, then restore it', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    const unlinked = await request(ctx.app).delete(`/api/calendar/events/${body.data.id}`).set(user.auth).expect(200);
    expect(unlinked.body.data).toMatchObject({ status: 'pending', google_event_id: null });
    expect(ctx.google.activeEvents()).toHaveLength(0);
    const restored = await request(ctx.app).post('/api/calendar/events').set(user.auth).send({ reminder_id: body.data.id }).expect(201);
    expect(restored.body.data.status).toBe('synced');
    expect(ctx.google.activeEvents()).toHaveLength(1);
  });

  it('retrieves live event details', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    const res = await request(ctx.app).get(`/api/calendar/events/${body.data.id}`).set(user.auth).expect(200);
    expect(res.body.data.event).toMatchObject({ summary: 'Dentist appointment', status: 'confirmed' });
  });

  it('validates reminder input', async () => {
    const cases = [
      [{ event_title: '' }, 'event_title'],
      [{ start_date: '2026-13-40' }, 'start_date'],
      [{ start_time: '25:00' }, 'start_time'],
      [{ start_time: null }, 'start_time'],
      [{ timezone: 'Nowhere/City' }, 'timezone'],
      [{ note_id: 'abc' }, 'note_id'],
    ];
    for (const [patch, path] of cases) {
      const res = await createReminder(patch);
      expect(res.status, path).toBe(400);
      expect(res.body.error.details.some((d) => d.path === path), path).toBe(true);
    }
    const noCalendar = await createReminder({ calendar_id: undefined });
    expect(noCalendar.body.error.code).toBe('calendar_required');
  });

  it('enforces ownership of reminders and linked notes', async () => {
    await connectCalendar(ctx, user);
    const { body } = await createReminder();
    const other = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000d2' });
    await request(ctx.app).get(`/api/reminders/${body.data.id}`).set(other.auth).expect(404);
    await request(ctx.app).patch(`/api/reminders/${body.data.id}`).set(other.auth).send({ event_title: 'x' }).expect(404);
    await request(ctx.app).delete(`/api/reminders/${body.data.id}`).set(other.auth).expect(404);
    const foreignNote = await request(ctx.app).post('/api/reminders').set(other.auth).send({ ...REMINDER, note_id: noteId, sync: false });
    expect(foreignNote.status).toBe(404);
    const list = await request(ctx.app).get('/api/reminders').set(other.auth).expect(200);
    expect(list.body.data).toHaveLength(0);
    expect(ctx.google.activeEvents()).toHaveLength(1);
  });

  it('creates unsynced drafts with sync=false and filters lists', async () => {
    await createReminder({ sync: false, calendar_id: undefined }).expect(201);
    const pending = await request(ctx.app).get('/api/reminders').query({ status: 'pending', note_id: noteId }).set(user.auth).expect(200);
    expect(pending.body.data).toHaveLength(1);
  });
});
