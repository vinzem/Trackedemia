/**
 * Google OAuth 2.0 + Google Calendar API client.
 *
 * Owns token storage (AES-256-GCM encrypted in `google_connections`, service
 * role only), token refresh, revocation handling and all Calendar REST calls.
 * It knows nothing about notes or reminders: callers pass plain event data.
 */
import { calendarErrors, AppError, badRequest, notConfigured } from '../utils/errors.js';
import { randomToken } from '../utils/crypto.js';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];
const REQUIRED_SCOPES = GOOGLE_SCOPES.slice(2);

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

/** Google event ids must use base32hex characters (a-v, 0-9), 5-1024 long. */
export function eventIdForReminder(reminderId) {
  return `tk${String(reminderId).toLowerCase().replace(/[^0-9a-f]/g, '')}`;
}

/** Builds the Google Calendar event resource from reminder fields. */
export function toGoogleEvent({ id, title, description, start, end, allDay, timezone, reminderId, appUrl, noteId }) {
  const link = noteId && appUrl ? `${appUrl}/notes/${noteId}` : null;
  const body = {
    summary: title,
    description: [description, link ? `Created from your Trackademia note: ${link}` : 'Created with Trackademia'].filter(Boolean).join('\n\n'),
    start: allDay ? { date: start.toISODate() } : { dateTime: start.toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: timezone },
    end: allDay ? { date: end.toISODate() } : { dateTime: end.toFormat("yyyy-MM-dd'T'HH:mm:ss"), timeZone: timezone },
    reminders: { useDefault: true },
    extendedProperties: { private: { trackademiaReminderId: String(reminderId || '') } },
    source: link ? { title: 'Trackademia', url: link } : undefined,
  };
  if (id) body.id = id;
  if (!body.source) delete body.source;
  return body;
}

export function createGoogleCalendarService({ config, adminDb, cipher, fetchImpl = globalThis.fetch, logger }) {
  const { clientId, clientSecret, redirectUri } = config.google;
  const configured = Boolean(clientId && clientSecret && cipher && adminDb);

  function ensureConfigured() {
    if (!configured) throw notConfigured('Google Calendar');
  }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (cause) {
      throw calendarErrors.network(cause);
    } finally {
      clearTimeout(timer);
    }
  }

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
  }

  // ---------------------------------------------------------------------------
  // Connection storage
  // ---------------------------------------------------------------------------
  async function loadConnection(userId) {
    const { data, error } = await adminDb.from('google_connections').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw new AppError('Could not load calendar connection.', { status: 500, code: 'database_error', cause: error });
    return data;
  }

  async function saveTokens(userId, tokens, extra = {}) {
    const row = {
      user_id: userId,
      access_token_encrypted: cipher.encrypt(tokens.access_token),
      token_expires_at: new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString(),
      status: 'active',
      ...extra,
    };
    if (tokens.refresh_token) row.refresh_token_encrypted = cipher.encrypt(tokens.refresh_token);
    if (tokens.scope) row.scopes = tokens.scope;
    const { error } = await adminDb.from('google_connections').upsert(row, { onConflict: 'user_id' });
    if (error) throw new AppError('Could not save calendar connection.', { status: 500, code: 'database_error', cause: error });
  }

  async function markRevoked(userId) {
    await adminDb.from('google_connections').update({ status: 'revoked' }).eq('user_id', userId);
  }

  async function tokenRequest(params) {
    const response = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }).toString(),
    });
    const body = await readJson(response);
    return { ok: response.ok, status: response.status, body };
  }

  async function refreshAccessToken(userId, connection) {
    const refreshToken = connection.refresh_token_encrypted ? cipher.decrypt(connection.refresh_token_encrypted) : null;
    if (!refreshToken) {
      await markRevoked(userId);
      throw calendarErrors.reauthRequired();
    }
    const result = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (!result.ok) {
      if (result.body?.error === 'invalid_grant' || result.status === 400 || result.status === 401) {
        logger?.warn('google_refresh_rejected', { user: userId, error_code: result.body?.error });
        await markRevoked(userId);
        throw calendarErrors.reauthRequired();
      }
      throw calendarErrors.unavailable();
    }
    await saveTokens(userId, result.body);
    return result.body.access_token;
  }

  async function getAccessToken(userId, { forceRefresh = false } = {}) {
    ensureConfigured();
    const connection = await loadConnection(userId);
    if (!connection) throw calendarErrors.notConnected();
    if (connection.status === 'revoked') throw calendarErrors.reauthRequired();
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
    if (!forceRefresh && expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return cipher.decrypt(connection.access_token_encrypted);
    }
    return refreshAccessToken(userId, connection);
  }

  /** Calls the Calendar API, refreshing the token once on 401. */
  async function calendarApi(userId, path, { method = 'GET', body, query } = {}) {
    const url = new URL(`${CALENDAR_API}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => value !== undefined && url.searchParams.set(key, String(value)));
    const send = async (token) => request(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

    let response = await send(await getAccessToken(userId));
    if (response.status === 401) response = await send(await getAccessToken(userId, { forceRefresh: true }));
    if (response.status === 204) return { status: 204, data: null };
    const data = await readJson(response);
    if (response.ok) return { status: response.status, data };

    const reason = data?.error?.errors?.[0]?.reason || data?.error?.status;
    logger?.warn('google_calendar_error', { user: userId, status_code: response.status, reason, method, path: path.replace(/\/events\/[^/]+/, '/events/:id') });
    if (response.status === 401) {
      await markRevoked(userId);
      throw calendarErrors.reauthRequired();
    }
    if (response.status === 403) {
      if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(reason || '')) throw calendarErrors.rateLimited();
      if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason || '')) throw calendarErrors.reauthRequired();
      throw calendarErrors.permissionDenied();
    }
    if (response.status === 404) {
      throw path.includes('/events/') ? calendarErrors.eventNotFound() : calendarErrors.calendarNotFound();
    }
    if (response.status === 410) throw calendarErrors.eventNotFound();
    if (response.status === 409) throw new AppError('Event already exists.', { status: 409, code: 'calendar_event_exists' });
    if (response.status === 429) throw calendarErrors.rateLimited();
    if (response.status === 400) throw calendarErrors.invalidRequest(data?.error?.message);
    throw calendarErrors.unavailable();
  }

  const calendarPath = (calendarId) => `/calendars/${encodeURIComponent(calendarId)}`;

  return {
    isConfigured: () => configured,
    scopes: GOOGLE_SCOPES,

    // -------------------------------------------------------------------------
    // OAuth
    // -------------------------------------------------------------------------
    async createAuthorizationUrl(userId, { redirectPath = '/settings', loginHint } = {}) {
      ensureConfigured();
      const nonce = randomToken(24);
      const expiresAt = new Date(Date.now() + STATE_TTL_MS);
      // Opportunistic cleanup of expired states.
      await adminDb.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
      const { error } = await adminDb.from('oauth_states').insert({ nonce, user_id: userId, redirect_path: redirectPath, expires_at: expiresAt.toISOString() });
      if (error) throw new AppError('Could not start Google authorization.', { status: 500, code: 'database_error', cause: error });
      const state = cipher.sign(`${nonce}.${userId}`);
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
        ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString();
      return url.toString();
    },

    /** Validates state, exchanges the code and stores encrypted tokens. */
    async handleCallback({ code, state, error }) {
      ensureConfigured();
      const verified = cipher.verify(state);
      if (!verified) throw badRequest('Invalid or tampered OAuth state.');
      const [nonce, userId] = verified.split('.');
      const { data: stored, error: stateError } = await adminDb.from('oauth_states').delete().eq('nonce', nonce).select('*').maybeSingle();
      if (stateError) throw new AppError('Could not verify OAuth state.', { status: 500, code: 'database_error', cause: stateError });
      if (!stored || stored.user_id !== userId) throw badRequest('OAuth state was already used or is unknown.');
      if (new Date(stored.expires_at).getTime() < Date.now()) throw badRequest('OAuth state expired. Please try connecting again.');
      const redirectPath = stored.redirect_path || '/settings';
      if (error) return { userId, redirectPath, error: error === 'access_denied' ? 'access_denied' : 'oauth_error' };
      if (!code) throw badRequest('Missing authorization code.');

      const result = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      if (!result.ok || !result.body.access_token) {
        logger?.warn('google_code_exchange_failed', { user: userId, status_code: result.status, error_code: result.body?.error });
        return { userId, redirectPath, error: 'exchange_failed' };
      }
      const granted = String(result.body.scope || '').split(/\s+/);
      if (!REQUIRED_SCOPES.every((scope) => granted.includes(scope))) {
        // Revoke the partial grant so the user can try again cleanly.
        await request(`${REVOKE_URL}?token=${encodeURIComponent(result.body.access_token)}`, { method: 'POST' }).catch(() => {});
        return { userId, redirectPath, error: 'scope_denied' };
      }

      let email = null;
      try {
        const info = await request(USERINFO_URL, { headers: { Authorization: `Bearer ${result.body.access_token}` } });
        if (info.ok) email = (await readJson(info)).email || null;
      } catch { /* email is informational only */ }

      const existing = await loadConnection(userId);
      await saveTokens(userId, result.body, {
        google_account_email: email,
        connected_at: new Date().toISOString(),
        // Keep a previous refresh token if Google did not send a new one.
        ...(!result.body.refresh_token && existing?.refresh_token_encrypted ? { refresh_token_encrypted: existing.refresh_token_encrypted } : {}),
      });
      return { userId, redirectPath, email };
    },

    async getStatus(userId) {
      if (!configured) return { configured: false, connected: false };
      const connection = await loadConnection(userId);
      if (!connection) return { configured: true, connected: false };
      return {
        configured: true,
        connected: connection.status === 'active',
        needs_reconnect: connection.status === 'revoked',
        google_account_email: connection.google_account_email,
        connected_at: connection.connected_at,
      };
    },

    async disconnect(userId) {
      ensureConfigured();
      const connection = await loadConnection(userId);
      if (!connection) return { disconnected: true, revoked: false };
      let revoked = false;
      const token = connection.refresh_token_encrypted || connection.access_token_encrypted;
      try {
        const response = await request(`${REVOKE_URL}?token=${encodeURIComponent(cipher.decrypt(token))}`, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        revoked = response.ok || response.status === 400; // 400 = already invalid
      } catch (cause) {
        logger?.warn('google_revoke_failed', { user: userId, cause });
      }
      const { error } = await adminDb.from('google_connections').delete().eq('user_id', userId);
      if (error) throw new AppError('Could not remove calendar connection.', { status: 500, code: 'database_error', cause: error });
      return { disconnected: true, revoked };
    },

    // -------------------------------------------------------------------------
    // Calendars & events
    // -------------------------------------------------------------------------
    async listCalendars(userId) {
      const { data } = await calendarApi(userId, '/users/me/calendarList', { query: { minAccessRole: 'writer', maxResults: 250 } });
      return (data.items || []).map((item) => ({
        id: item.id,
        name: item.summaryOverride || item.summary,
        primary: Boolean(item.primary),
        access_role: item.accessRole,
        time_zone: item.timeZone || null,
        color: item.backgroundColor || null,
      })).sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
    },

    async getEvent(userId, calendarId, eventId) {
      const { data } = await calendarApi(userId, `${calendarPath(calendarId)}/events/${encodeURIComponent(eventId)}`);
      return data;
    },

    /**
     * Creates an event with a deterministic id so retries never duplicate it.
     * If the id already exists (a previous attempt succeeded, or the event was
     * deleted), the existing event is reused / restored and updated.
     */
    async createEvent(userId, calendarId, event) {
      try {
        const { data } = await calendarApi(userId, `${calendarPath(calendarId)}/events`, { method: 'POST', body: event });
        return { event: data, reused: false };
      } catch (error) {
        if (error.code !== 'calendar_event_exists' || !event.id) throw error;
        const { data } = await calendarApi(userId, `${calendarPath(calendarId)}/events/${encodeURIComponent(event.id)}`, {
          method: 'PUT', body: { ...event, status: 'confirmed' },
        });
        return { event: data, reused: true };
      }
    },

    async updateEvent(userId, calendarId, eventId, event) {
      const body = { ...event };
      delete body.id;
      const { data } = await calendarApi(userId, `${calendarPath(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body });
      return data;
    },

    /** Deletes an event. Already-deleted events are treated as success. */
    async deleteEvent(userId, calendarId, eventId) {
      try {
        await calendarApi(userId, `${calendarPath(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE', query: { sendUpdates: 'none' } });
        return { deleted: true, alreadyGone: false };
      } catch (error) {
        if (error.code === 'calendar_event_not_found') return { deleted: true, alreadyGone: true };
        throw error;
      }
    },
  };
}
