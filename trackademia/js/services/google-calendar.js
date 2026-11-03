/**
 * Simulated Google Calendar integration.
 *
 * Nothing here talks to Google. Each function mirrors the shape of a future
 * real call (Google Identity Services for OAuth, Calendar API v3 for events)
 * and returns a structured mock response flagged with `meta.simulated`.
 */
import { simulateRequest } from './api.js';
import { generateId } from '../utils/helpers.js';
import { parseISODate } from '../utils/date-utils.js';

export const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/r';
export const OAUTH_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
export const AVAILABLE_CALENDARS = Object.freeze(['Personal', 'Work', 'School']);

const DEMO_ACCOUNT = Object.freeze({ name: 'Alex Rivera', email: 'alex.rivera@example.com' });

function assertCalendar(name) {
  if (!AVAILABLE_CALENDARS.includes(name)) throw new Error(`Unknown calendar "${name}".`);
}

/** Future: request an OAuth token with OAUTH_SCOPES via Google Identity Services. */
export function connectAccount(profile = {}) {
  return simulateRequest(
    () => ({
      account: {
        name: profile.name || DEMO_ACCOUNT.name,
        email: profile.email || DEMO_ACCOUNT.email,
        provider: 'google',
      },
      scopes: OAUTH_SCOPES,
      defaultCalendar: 'Personal',
    }),
    { label: 'oauth.connect', latency: 700 },
  );
}

export function disconnectAccount() {
  return simulateRequest(() => ({ revoked: true }), { label: 'oauth.revoke', latency: 300 });
}

/** Future: GET /users/me/calendarList */
export function listCalendars() {
  return simulateRequest(
    () => AVAILABLE_CALENDARS.map((name) => ({ id: name.toLowerCase(), summary: name })),
    { label: 'calendarList.list', latency: 200 },
  );
}

export function buildEventUrl(reminder) {
  const date = parseISODate(reminder?.date);
  if (!date) return GOOGLE_CALENDAR_URL;
  return `${GOOGLE_CALENDAR_URL}/day/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** Future: POST /calendars/{calendarId}/events */
export function createEvent(reminder) {
  return simulateRequest(() => {
    assertCalendar(reminder.calendar);
    return {
      eventId: generateId('evt'),
      calendar: reminder.calendar,
      status: 'confirmed',
      htmlLink: buildEventUrl(reminder),
    };
  }, { label: 'events.insert', latency: 650 });
}

/** Future: PATCH /calendars/{calendarId}/events/{eventId} */
export function updateEvent(eventId, reminder) {
  return simulateRequest(() => {
    if (!eventId) throw new Error('Missing event id.');
    assertCalendar(reminder.calendar);
    return { eventId, calendar: reminder.calendar, status: 'confirmed', htmlLink: buildEventUrl(reminder) };
  }, { label: 'events.patch', latency: 450 });
}

/** Future: DELETE /calendars/{calendarId}/events/{eventId} */
export function deleteEvent(eventId) {
  return simulateRequest(() => ({ eventId, deleted: true }), { label: 'events.delete', latency: 350 });
}

/** Returns the URL the event would open at; the UI decides whether to navigate. */
export function openEvent(reminder) {
  return simulateRequest(() => ({ url: buildEventUrl(reminder), eventId: reminder?.eventId || null }), {
    label: 'events.open',
    latency: 150,
  });
}
