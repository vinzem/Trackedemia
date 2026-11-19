/**
 * REST client for the Trackademia API. Attaches the Supabase access token,
 * refreshes it once on 401, and normalises every failure into ApiError.
 */
import { config } from '../config.js';
import { supabase } from './supabase.js';

export class ApiError extends Error {
  constructor({ status = 0, code = 'unknown_error', message = 'Something went wrong.', details, recovery, retryable = false }) {
    super(message);
    Object.assign(this, { name: 'ApiError', status, code, details, recovery, retryable });
  }
}

let unauthorizedHandler = () => {};
/** Registers what to do when the session can no longer be refreshed. */
export function onUnauthorized(handler) { unauthorizedHandler = handler; }

async function accessToken({ refresh = false } = {}) {
  if (!supabase) return null;
  if (refresh) {
    const { data } = await supabase.auth.refreshSession();
    return data?.session?.access_token || null;
  }
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function send(method, path, { body, query, signal, retry = true } = {}) {
  const url = new URL(`${config.apiUrl}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const exec = async (token) => fetch(url, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let response;
  try {
    response = await exec(await accessToken());
    if (response.status === 401 && retry) {
      const fresh = await accessToken({ refresh: true });
      if (fresh) response = await exec(fresh);
    }
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({ code: 'network_error', message: 'Could not reach the server. Check your connection and try again.', retryable: true });
  }

  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (response.ok) return payload;

  const error = new ApiError({ status: response.status, ...(payload.error || {}), message: payload.error?.message || `Request failed (${response.status}).` });
  if (response.status === 401 && ['unauthorized', 'invalid_session', 'session_expired'].includes(error.code)) unauthorizedHandler(error);
  throw error;
}

export const api = {
  get: (path, options) => send('GET', path, options),
  post: (path, body, options) => send('POST', path, { ...options, body: body ?? {} }),
  patch: (path, body, options) => send('PATCH', path, { ...options, body }),
  delete: (path, options) => send('DELETE', path, options),
};
