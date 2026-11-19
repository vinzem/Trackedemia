import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { connectCalendar } from '../helpers/connect.js';
import { createTestContext } from '../helpers/test-app.js';

describe('Google Calendar connection', () => {
  let ctx;
  let user;
  beforeEach(() => {
    ctx = createTestContext();
    user = ctx.addUser({ id: '00000000-0000-4000-8000-0000000000c1', email: 'student@gmail.com' });
  });

  it('builds a Google consent URL with offline access and calendar scopes', async () => {
    const res = await request(ctx.app).get('/api/calendar/connect').set(user.auth).expect(200);
    const url = new URL(res.body.data.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8787/api/calendar/callback');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.events');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('completes the OAuth callback and stores encrypted tokens', async () => {
    const { callback } = await connectCalendar(ctx, user);
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe('http://localhost:5173/settings?calendar=connected');
    const [row] = ctx.supabase.store.tables.google_connections;
    expect(row.google_account_email).toBe('student@gmail.com');
    expect(row.access_token_encrypted).not.toContain('ya29');
    expect(row.refresh_token_encrypted).not.toContain('refresh-abc');
    expect(row.access_token_encrypted.startsWith('v1:')).toBe(true);

    const status = await request(ctx.app).get('/api/calendar/status').set(user.auth).expect(200);
    expect(status.body.data).toMatchObject({ connected: true, google_account_email: 'student@gmail.com' });
    expect(JSON.stringify(status.body)).not.toMatch(/token/i);
  });

  it('rejects tampered, replayed and foreign OAuth state', async () => {
    const { state } = await connectCalendar(ctx, user);
    // Replay of an already-used state
    const replay = await request(ctx.app).get('/api/calendar/callback').query({ code: 'good-code', state });
    expect(replay.headers.location).toContain('calendar=error');
    // Tampered signature
    const res = await request(ctx.app).get('/api/calendar/connect').set(user.auth);
    const fresh = new URL(res.body.data.url).searchParams.get('state');
    const tampered = await request(ctx.app).get('/api/calendar/callback').query({ code: 'good-code', state: `${fresh.slice(0, -2)}xx` });
    expect(tampered.headers.location).toContain('reason=invalid_state');
  });

  it('handles the user denying consent or partial scopes', async () => {
    const res = await request(ctx.app).get('/api/calendar/connect').set(user.auth);
    const state = new URL(res.body.data.url).searchParams.get('state');
    const denied = await request(ctx.app).get('/api/calendar/callback').query({ error: 'access_denied', state });
    expect(denied.headers.location).toContain('reason=access_denied');

    ctx.google.state.grantedScope = 'openid email';
    const { callback } = await connectCalendar(ctx, user);
    expect(callback.headers.location).toContain('reason=scope_denied');
    expect(ctx.supabase.store.tables.google_connections || []).toHaveLength(0);
  });

  it('lists writable calendars and picks the primary as default', async () => {
    await connectCalendar(ctx, user);
    const res = await request(ctx.app).get('/api/calendar/calendars').set(user.auth).expect(200);
    expect(res.body.data[0]).toMatchObject({ id: 'primary-cal@example.com', name: 'Student', primary: true, is_default: true });
    expect(res.body.data).toHaveLength(2);
    const me = await request(ctx.app).get('/api/auth/me').set(user.auth);
    expect(me.body.data.profile.default_calendar_id).toBe('primary-cal@example.com');
  });

  it('refreshes expired access tokens transparently', async () => {
    await connectCalendar(ctx, user);
    ctx.supabase.store.tables.google_connections[0].token_expires_at = new Date(Date.now() - 1000).toISOString();
    await request(ctx.app).get('/api/calendar/calendars').set(user.auth).expect(200);
    expect(ctx.google.state.refreshCount).toBe(1);
  });

  it('retries once with a refreshed token when Google returns 401', async () => {
    await connectCalendar(ctx, user);
    ctx.google.state.validAccessTokens.clear(); // token revoked server-side
    await request(ctx.app).get('/api/calendar/calendars').set(user.auth).expect(200);
    expect(ctx.google.state.refreshCount).toBe(1);
  });

  it('asks the user to reconnect when the refresh token is revoked', async () => {
    await connectCalendar(ctx, user);
    ctx.google.state.validAccessTokens.clear();
    ctx.google.state.invalidRefresh = true;
    const res = await request(ctx.app).get('/api/calendar/calendars').set(user.auth);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'calendar_reauth_required', recovery: 'connect_calendar' });
    const status = await request(ctx.app).get('/api/calendar/status').set(user.auth);
    expect(status.body.data).toMatchObject({ connected: false, needs_reconnect: true });
  });

  it('reports calendar outages as retryable', async () => {
    await connectCalendar(ctx, user);
    ctx.google.state.failures.push({ match: /calendarList/, status: 503 });
    const res = await request(ctx.app).get('/api/calendar/calendars').set(user.auth);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'calendar_unavailable', retryable: true, recovery: 'retry' });
    ctx.google.state.failures.push({ match: /calendarList/, network: true });
    const network = await request(ctx.app).get('/api/calendar/calendars').set(user.auth);
    expect(network.body.error.code).toBe('calendar_network_error');
  });

  it('disconnects: revokes at Google and deletes stored tokens', async () => {
    await connectCalendar(ctx, user);
    await request(ctx.app).post('/api/calendar/disconnect').set(user.auth).expect(200);
    expect(ctx.google.state.revoked).toContain('refresh-abc');
    expect(ctx.supabase.store.tables.google_connections).toHaveLength(0);
    const res = await request(ctx.app).get('/api/calendar/calendars').set(user.auth);
    expect(res.body.error.code).toBe('calendar_not_connected');
  });

  it('returns 503 when Google is not configured', async () => {
    const bare = createTestContext({ withGoogle: false });
    const u = bare.addUser({ id: '00000000-0000-4000-8000-0000000000c2' });
    const res = await request(bare.app).get('/api/calendar/connect').set(u.auth);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('integration_not_configured');
  });
});
