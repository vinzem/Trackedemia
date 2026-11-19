import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers/test-app.js';

const NOW = '2026-11-03T12:30:00+08:00';

describe('POST /api/ai/extract-reminders', () => {
  it('falls back to deterministic parsing when OpenAI is not configured', async () => {
    const ctx = createTestContext();
    const user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000e1' });
    const res = await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth)
      .send({ text: 'Dentist appointment tomorrow at 10am.', timezone: 'Asia/Manila', now: NOW }).expect(200);
    expect(res.body.data).toMatchObject({ engine: 'rules', ai_used: false, fallback_reason: 'ai_not_configured', detected: true });
    expect(res.body.data.events[0]).toMatchObject({
      event_title: 'Dentist appointment', start_datetime: '2026-11-04T10:00:00', timezone: 'Asia/Manila', source_text: 'tomorrow at 10am',
    });
  });

  it('uses the profile timezone when none is supplied', async () => {
    const ctx = createTestContext();
    const user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000e2' });
    await request(ctx.app).patch('/api/auth/profile').set(user.auth).send({ timezone: 'America/New_York' });
    const res = await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth).send({ text: 'Call at 9am tomorrow', now: '2026-11-03T03:00:00Z' });
    // 03:00Z is still Nov 2 in New York, so "tomorrow" is Nov 3.
    expect(res.body.data.events[0].start_date).toBe('2026-11-03');
    expect(res.body.data.timezone).toBe('America/New_York');
  });

  it('validates OpenAI output, drops invented times and unknown source text, and minimises data sent', async () => {
    const ctx = createTestContext({
      openai: {
        events: [
          {
            event_title: 'Call the supplier', event_description: null, start_date: '2026-11-06', start_time: '15:00', end_date: null, end_time: null,
            duration_minutes: null, timezone: 'Asia/Manila', confidence: 0.8, source_text: 'Friday afternoon', missing_fields: [], clarification: null, is_past: false,
          },
          {
            event_title: 'Hallucinated', event_description: null, start_date: '2026-12-01', start_time: '09:00', end_date: null, end_time: null,
            duration_minutes: null, timezone: 'Asia/Manila', confidence: 0.9, source_text: 'on Dec 1 at 9', missing_fields: [], clarification: null, is_past: false,
          },
          { event_title: 'Broken', start_date: 'not-a-date' },
        ],
      },
    });
    const user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000e3' });
    const text = 'Shopping list: eggs, milk.\nCall the supplier Friday afternoon, email bob@example.com or +63 912 345 6789.';
    const res = await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth).send({ text, timezone: 'Asia/Manila', now: NOW }).expect(200);

    expect(res.body.data.ai_used).toBe(true);
    expect(res.body.data.events).toHaveLength(1);
    const [event] = res.body.data.events;
    expect(event).toMatchObject({ event_title: 'Call the supplier', start_date: '2026-11-06', start_time: null, missing_fields: ['start_time'] });
    expect(text.slice(event.range.start, event.range.end)).toBe('Friday afternoon');

    const sent = ctx.google.state.lastOpenAiRequest.messages.at(-1).content;
    expect(sent).not.toContain('Shopping list');
    expect(sent).not.toContain('bob@example.com');
    expect(sent).not.toContain('912 345');
    expect(sent).toContain('[email]');
    expect(ctx.google.state.lastOpenAiRequest.response_format.type).toBe('json_schema');
  });

  it('falls back to rules when OpenAI errors', async () => {
    const ctx = createTestContext({ withOpenAI: true });
    const user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000e4' });
    const res = await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth)
      .send({ text: 'Project review in two hours', timezone: 'Asia/Manila', now: NOW }).expect(200);
    expect(res.body.data).toMatchObject({ engine: 'rules', fallback_reason: 'ai_unavailable' });
    expect(res.body.data.events[0].start_datetime).toBe('2026-11-03T14:30:00');
  });

  it('respects the user opting out of AI processing', async () => {
    const ctx = createTestContext({ openai: { events: [] } });
    const user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000e5' });
    await request(ctx.app).patch('/api/auth/profile').set(user.auth).send({ ai_detection_enabled: false });
    const res = await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth).send({ text: 'Exam on Nov 20 at 8am', now: NOW });
    expect(res.body.data.ai_used).toBe(false);
    expect(ctx.google.state.lastOpenAiRequest).toBeUndefined();
  });

  it('validates the request and rate limits', async () => {
    const ctx = createTestContext({ rateLimit: true });
    const user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000e6' });
    await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth).send({ text: '' }).expect(400);
    await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth).send({ text: 'x'.repeat(20001) }).expect(400);
    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await request(ctx.app).post('/api/ai/extract-reminders').set(user.auth).send({ text: 'Lunch at noon' });
    }
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('rate_limited');
  });
});
