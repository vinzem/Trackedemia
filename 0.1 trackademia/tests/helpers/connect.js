import request from 'supertest';

/** Runs the real OAuth connect + callback flow against the fake Google. */
export async function connectCalendar(ctx, user, { code = 'good-code' } = {}) {
  const res = await request(ctx.app).get('/api/calendar/connect').set(user.auth).expect(200);
  const state = new URL(res.body.data.url).searchParams.get('state');
  const callback = await request(ctx.app).get('/api/calendar/callback').query({ code, state });
  return { authUrl: res.body.data.url, state, callback };
}
