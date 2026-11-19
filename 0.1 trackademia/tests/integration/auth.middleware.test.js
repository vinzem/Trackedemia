import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../../server/middleware/auth.middleware.js';
import { createTestContext } from '../helpers/test-app.js';

describe('authentication middleware', () => {
  const ctx = createTestContext();
  const user = ctx.addUser({ id: '00000000-0000-4000-8000-000000000001' });

  it('parses only well-formed bearer tokens', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer short')).toBeNull();
    expect(extractBearerToken(`Bearer ${'x'.repeat(30)}`)).toBe('x'.repeat(30));
  });

  it.each([
    ['GET', '/api/notes'],
    ['POST', '/api/notes'],
    ['GET', '/api/reminders'],
    ['POST', '/api/reminders'],
    ['POST', '/api/ai/extract-reminders'],
    ['GET', '/api/auth/me'],
  ])('rejects %s %s without a token', async (method, path) => {
    const res = await request(ctx.app)[method.toLowerCase()](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(res.body.error.recovery).toBe('sign_in');
  });

  it('rejects an invalid token', async () => {
    const res = await request(ctx.app).get('/api/notes').set('Authorization', `Bearer ${'z'.repeat(40)}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_session');
  });

  it('accepts a valid token and returns the profile', async () => {
    const res = await request(ctx.app).get('/api/auth/me').set(user.auth).expect(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.profile.timezone).toBe('UTC');
  });

  it('validates profile updates, including timezone', async () => {
    const bad = await request(ctx.app).patch('/api/auth/profile').set(user.auth).send({ timezone: 'Mars/Olympus' });
    expect(bad.status).toBe(400);
    const ok = await request(ctx.app).patch('/api/auth/profile').set(user.auth).send({ timezone: 'Asia/Manila', display_name: 'Naz' }).expect(200);
    expect(ok.body.data.timezone).toBe('Asia/Manila');
  });

  it('exposes a public health check and 404s unknown routes', async () => {
    const health = await request(ctx.app).get('/api/health').expect(200);
    expect(health.body.data.status).toBe('ok');
    const missing = await request(ctx.app).get('/api/nope').expect(404);
    expect(missing.body.error.code).toBe('route_not_found');
  });

  it('only allows configured CORS origins', async () => {
    const allowed = await request(ctx.app).options('/api/notes').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(ctx.app).options('/api/notes').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
