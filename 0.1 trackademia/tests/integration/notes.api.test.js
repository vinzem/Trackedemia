import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

describe('notes API', () => {
  let ctx;
  let alice;
  let bob;
  beforeEach(() => {
    ctx = createTestContext();
    alice = ctx.addUser({ id: '00000000-0000-4000-8000-00000000000a' });
    bob = ctx.addUser({ id: '00000000-0000-4000-8000-00000000000b' });
  });

  const create = (user, body) => request(ctx.app).post('/api/notes').set(user.auth).send(body);

  it('creates, reads, edits and deletes a note', async () => {
    const created = await create(alice, { title: 'Thesis', content: 'Draft due next Monday at 3pm' }).expect(201);
    const { id } = created.body.data;
    expect(created.body.data).toMatchObject({ title: 'Thesis', user_id: alice.id, reminders: [] });

    const fetched = await request(ctx.app).get(`/api/notes/${id}`).set(alice.auth).expect(200);
    expect(fetched.body.data.content).toContain('next Monday');

    const edited = await request(ctx.app).patch(`/api/notes/${id}`).set(alice.auth).send({ content: 'Updated' }).expect(200);
    expect(edited.body.data.content).toBe('Updated');
    expect(edited.body.data.title).toBe('Thesis');

    await request(ctx.app).delete(`/api/notes/${id}`).set(alice.auth).expect(200);
    await request(ctx.app).get(`/api/notes/${id}`).set(alice.auth).expect(404);
  });

  it('persists notes in the database table', async () => {
    await create(alice, { title: 'Stored', content: 'x' }).expect(201);
    expect(ctx.supabase.store.tables.notes).toHaveLength(1);
    expect(ctx.supabase.store.tables.notes[0]).toMatchObject({ title: 'Stored', user_id: alice.id });
  });

  it('lists, sorts and searches only the caller\'s notes', async () => {
    await create(alice, { title: 'Biology', content: 'Lab report on Friday' });
    await create(alice, { title: 'Chemistry', content: 'Titration notes' });
    await create(bob, { title: 'Bob private', content: 'Biology secret' });

    const all = await request(ctx.app).get('/api/notes').set(alice.auth).expect(200);
    expect(all.body.data.map((n) => n.title)).toEqual(['Chemistry', 'Biology']);
    expect(all.body.meta.total).toBe(2);

    const byTitle = await request(ctx.app).get('/api/notes').query({ sort: 'title_asc' }).set(alice.auth).expect(200);
    expect(byTitle.body.data.map((n) => n.title)).toEqual(['Biology', 'Chemistry']);

    const search = await request(ctx.app).get('/api/notes').query({ q: 'biology' }).set(alice.auth).expect(200);
    expect(search.body.data.map((n) => n.title)).toEqual(['Biology']);

    const content = await request(ctx.app).get('/api/notes').query({ q: 'titration' }).set(alice.auth).expect(200);
    expect(content.body.data).toHaveLength(1);

    const injection = await request(ctx.app).get('/api/notes').query({ q: '%,title.ilike.%' }).set(alice.auth).expect(200);
    expect(injection.body.data).toHaveLength(0);
  });

  it('prevents access to another user\'s note', async () => {
    const created = await create(alice, { title: 'Mine', content: '' });
    const { id } = created.body.data;
    await request(ctx.app).get(`/api/notes/${id}`).set(bob.auth).expect(404);
    await request(ctx.app).patch(`/api/notes/${id}`).set(bob.auth).send({ title: 'hacked' }).expect(404);
    await request(ctx.app).delete(`/api/notes/${id}`).set(bob.auth).expect(404);
    const still = await request(ctx.app).get(`/api/notes/${id}`).set(alice.auth).expect(200);
    expect(still.body.data.title).toBe('Mine');
  });

  it('validates input', async () => {
    const tooLong = await create(alice, { title: 'x'.repeat(201) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('validation_error');
    const unknownField = await create(alice, { title: 'a', user_id: bob.id });
    expect(unknownField.status).toBe(400);
    await request(ctx.app).get('/api/notes/not-a-uuid').set(alice.auth).expect(400);
    const empty = await request(ctx.app).patch(`/api/notes/${'00000000-0000-4000-8000-000000000000'}`).set(alice.auth).send({});
    expect(empty.status).toBe(400);
  });

  it('rejects stale edits from another device', async () => {
    const created = await create(alice, { title: 'Shared', content: 'v1' });
    const { id, updated_at: stale } = created.body.data;
    await request(ctx.app).patch(`/api/notes/${id}`).set(alice.auth).send({ content: 'v2 from phone' }).expect(200);
    const res = await request(ctx.app).patch(`/api/notes/${id}`).set(alice.auth).send({ content: 'v2 from laptop', expected_updated_at: stale });
    expect(res.status).toBe(409);
    expect(res.body.error.details.current.content).toBe('v2 from phone');
  });

  it('maps database failures to a 500 without leaking details', async () => {
    ctx.supabase.store.failNext = { code: 'XX000', message: 'boom secret' };
    const res = await request(ctx.app).get('/api/notes').set(alice.auth);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
