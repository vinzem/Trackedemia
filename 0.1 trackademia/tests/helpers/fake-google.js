/**
 * Fake `fetch` implementing the Google OAuth, userinfo and Calendar endpoints
 * used by the API (and optionally OpenAI). State is inspectable by tests.
 */
export function createFakeGoogle({ openai } = {}) {
  const state = {
    calendars: [
      { id: 'primary-cal@example.com', summary: 'Student', primary: true, accessRole: 'owner', timeZone: 'Asia/Manila', backgroundColor: '#6366F1' },
      { id: 'school@group.calendar.google.com', summary: 'School', accessRole: 'writer', timeZone: 'Asia/Manila' },
    ],
    events: new Map(), // `${calendarId}|${eventId}` -> event
    issuedTokens: 0,
    revoked: [],
    refreshCount: 0,
    failures: [], // queue of { match: RegExp, status, body }
    grantedScope: 'openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events',
    invalidRefresh: false,
    validAccessTokens: new Set(),
    calls: [],
    openaiResponse: openai || null,
  };

  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

  const issue = () => {
    state.issuedTokens += 1;
    const token = `ya29.fake-${state.issuedTokens}`;
    state.validAccessTokens.add(token);
    return token;
  };

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init.method || 'GET').toUpperCase();
    state.calls.push(`${method} ${url.origin}${url.pathname}`);

    const failure = state.failures.findIndex((f) => f.match.test(`${method} ${url.pathname}`));
    if (failure >= 0) {
      const [f] = state.failures.splice(failure, 1);
      if (f.network) throw new TypeError('fetch failed');
      return json(f.status, f.body ?? { error: { errors: [{ reason: f.reason || 'backendError' }], message: 'fail' } });
    }

    if (url.hostname === 'api.openai.com') {
      if (!state.openaiResponse) return json(500, { error: 'no fake configured' });
      const body = JSON.parse(init.body);
      state.lastOpenAiRequest = body;
      const content = typeof state.openaiResponse === 'function' ? state.openaiResponse(body) : state.openaiResponse;
      return json(200, { choices: [{ message: { content: JSON.stringify(content) } }] });
    }

    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const params = new URLSearchParams(init.body);
      if (params.get('grant_type') === 'authorization_code') {
        if (params.get('code') !== 'good-code') return json(400, { error: 'invalid_grant' });
        return json(200, { access_token: issue(), refresh_token: 'refresh-abc', expires_in: 3600, scope: state.grantedScope, token_type: 'Bearer' });
      }
      if (params.get('grant_type') === 'refresh_token') {
        state.refreshCount += 1;
        if (state.invalidRefresh || params.get('refresh_token') !== 'refresh-abc') return json(400, { error: 'invalid_grant' });
        return json(200, { access_token: issue(), expires_in: 3600, scope: state.grantedScope });
      }
    }
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
      state.revoked.push(url.searchParams.get('token'));
      return json(200, {});
    }
    if (url.hostname === 'openidconnect.googleapis.com') return json(200, { email: 'student@gmail.com' });

    if (url.hostname === 'www.googleapis.com') {
      const token = (init.headers?.Authorization || '').replace('Bearer ', '');
      if (!state.validAccessTokens.has(token)) return json(401, { error: { errors: [{ reason: 'authError' }], message: 'Invalid Credentials' } });
      const path = url.pathname.replace('/calendar/v3', '');
      if (path === '/users/me/calendarList') return json(200, { items: state.calendars });
      const match = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
      if (match) {
        const calendarId = decodeURIComponent(match[1]);
        if (!state.calendars.some((c) => c.id === calendarId)) return json(404, { error: { errors: [{ reason: 'notFound' }] } });
        const eventId = match[2] && decodeURIComponent(match[2]);
        const key = `${calendarId}|${eventId}`;
        if (method === 'POST') {
          const body = JSON.parse(init.body);
          const id = body.id || `evt${state.events.size + 1}`;
          if (state.events.has(`${calendarId}|${id}`)) return json(409, { error: { errors: [{ reason: 'duplicate' }] } });
          const event = { ...body, id, status: 'confirmed', htmlLink: `https://www.google.com/calendar/event?eid=${id}` };
          state.events.set(`${calendarId}|${id}`, event);
          return json(200, event);
        }
        const existing = state.events.get(key);
        if (!existing) return json(404, { error: { errors: [{ reason: 'notFound' }] } });
        if (method === 'GET') return json(200, existing);
        if (method === 'PUT' || method === 'PATCH') {
          const body = JSON.parse(init.body);
          const event = method === 'PUT' ? { ...body, id: eventId, htmlLink: existing.htmlLink } : { ...existing, ...body };
          state.events.set(key, event);
          return json(200, event);
        }
        if (method === 'DELETE') {
          if (existing.status === 'cancelled') return json(410, { error: { errors: [{ reason: 'deleted' }] } });
          existing.status = 'cancelled';
          return new Response(null, { status: 204 });
        }
      }
    }
    return json(404, { error: `unhandled fake route ${method} ${url}` });
  }

  return {
    state,
    fetch: fetchImpl,
    activeEvents: () => [...state.events.values()].filter((e) => e.status !== 'cancelled'),
  };
}
