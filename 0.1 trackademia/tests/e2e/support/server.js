/**
 * E2E backend: the real Express API (real routes and validation) wired to
 * in-memory Supabase tables and a fake AI API,
 * plus a minimal Supabase Auth (GoTrue) stand-in for the browser client.
 * Used only by Playwright; never deployed.
 */
import http from 'node:http';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { buildServices, createApp } from '../../../server/app.js';
import { loadConfig } from '../../../server/config/env.js';
import { unauthorized } from '../../../server/utils/errors.js';
import { createLogger } from '../../../server/utils/logger.js';
import { createFakeGoogle } from '../../helpers/fake-google.js';
import { createFakeSupabase } from '../../helpers/fake-supabase.js';

const API_PORT = Number(process.env.E2E_API_PORT || 8788);
const AUTH_PORT = Number(process.env.E2E_AUTH_PORT || 8790);
const APP_URL = process.env.E2E_APP_URL || 'http://localhost:4173';

const config = loadConfig({
  NODE_ENV: 'test',
  APP_URL,
  API_URL: `http://localhost:${API_PORT}`,
  SUPABASE_URL: `http://localhost:${AUTH_PORT}`,
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
});

const supabase = createFakeSupabase();
const google = createFakeGoogle();
const users = new Map(); // email -> { user, password }
const tokens = new Map(); // access token -> user
const refreshTokens = new Map(); // refresh token -> user

const authService = {
  async verifyAccessToken(token) {
    const user = tokens.get(token);
    if (!user) throw unauthorized('Invalid session.', 'invalid_session');
    return { id: user.id, email: user.email, name: user.user_metadata.full_name, emailConfirmed: true, provider: 'email' };
  },
  userDb: (token) => supabase.forUserId(tokens.get(token).id),
};

const logger = createLogger({ level: 'warn' });
const services = buildServices({ config, database: { admin: supabase.admin }, fetchImpl: google.fetch, logger, authService });
const api = createApp({ config, services, logger, rateLimit: false });
const app = express();

// Test-only inspection endpoint (mounted before the real API).
app.get('/__test/state', (_req, res) => {
  res.json({ events: supabase.store.tables.reminders || [], reminders: supabase.store.tables.reminders || [], notes: supabase.store.tables.notes || [] });
});
app.use(api);
app.listen(API_PORT, () => console.log(`e2e api on ${API_PORT}`));

// ---------------------------------------------------------------------------
// Minimal GoTrue + Storage stand-in
// ---------------------------------------------------------------------------
function session(user) {
  const access = `e2e-access-${randomUUID()}`;
  const refresh = `e2e-refresh-${randomUUID()}`;
  tokens.set(access, user);
  refreshTokens.set(refresh, user);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${AUTH_PORT}`);
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204);

  const body = req.method === 'POST' ? await readBody(req) : {};
  if (url.pathname === '/auth/v1/signup') {
    if (users.has(body.email)) return send(422, { code: 'user_already_exists', msg: 'User already registered' });
    const user = {
      id: randomUUID(), aud: 'authenticated', role: 'authenticated', email: body.email,
      email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: body.data || {}, created_at: new Date().toISOString(),
    };
    users.set(body.email, { user, password: body.password });
    return send(200, session(user));
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const record = users.get(body.email);
    if (!record || record.password !== body.password) return send(400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
    return send(200, session(record.user));
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const user = refreshTokens.get(body.refresh_token);
    if (!user) return send(400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' });
    return send(200, session(user));
  }
  if (url.pathname === '/auth/v1/user') {
    const user = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
    return user ? send(200, user) : send(401, { msg: 'invalid JWT' });
  }
  if (url.pathname === '/auth/v1/logout') return send(204);
  if (url.pathname.startsWith('/storage/v1/object/list/')) return send(200, []);
  return send(404, { msg: `unhandled ${req.method} ${url.pathname}` });
}).listen(AUTH_PORT, () => console.log(`e2e auth on ${AUTH_PORT}`));
