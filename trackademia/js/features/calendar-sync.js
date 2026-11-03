/**
 * Bridges reminders and the (simulated) Google Calendar service, and keeps
 * the calendar connection status in shared state.
 */
import * as googleCalendar from '../services/google-calendar.js';
import { getState, setState } from '../state.js';

export const AVAILABLE_CALENDARS = googleCalendar.AVAILABLE_CALENDARS;

export function isCalendarConnected() {
  return getState().calendarConnected;
}

export function getDefaultCalendar() {
  const { connectedCalendar } = getState();
  return AVAILABLE_CALENDARS.includes(connectedCalendar) ? connectedCalendar : AVAILABLE_CALENDARS[0];
}

export function selectCalendar(name) {
  if (AVAILABLE_CALENDARS.includes(name)) setState({ connectedCalendar: name });
}

/** Simulated Google sign-in. Also creates the local user when none exists. */
export async function connectCalendar() {
  const { user } = getState();
  const response = await googleCalendar.connectAccount(user || {});
  if (response.ok) {
    const { account, defaultCalendar } = response.data;
    setState({
      user: { ...(user || {}), name: user?.name || account.name, email: user?.email || account.email, googleConnected: true, provider: user?.provider || 'google' },
      calendarConnected: true,
      connectedCalendar: getState().connectedCalendar || defaultCalendar,
    });
  }
  return response;
}

export async function disconnectCalendar() {
  const response = await googleCalendar.disconnectAccount();
  if (response.ok) {
    const { user } = getState();
    setState({ calendarConnected: false, user: user ? { ...user, googleConnected: false } : null });
  }
  return response;
}

export async function ensureCalendarConnected() {
  if (isCalendarConnected()) return { ok: true, data: { alreadyConnected: true }, error: null };
  return connectCalendar();
}

export async function syncReminderToCalendar(reminder) {
  const connection = await ensureCalendarConnected();
  if (!connection.ok) return connection;
  const response = await googleCalendar.createEvent(reminder);
  return { ...response, connectedNow: !connection.data?.alreadyConnected };
}

export async function updateCalendarEvent(reminder) {
  if (!reminder.eventId) return syncReminderToCalendar(reminder);
  const connection = await ensureCalendarConnected();
  if (!connection.ok) return connection;
  return googleCalendar.updateEvent(reminder.eventId, reminder);
}

export function removeCalendarEvent(eventId) {
  return googleCalendar.deleteEvent(eventId);
}

export async function getCalendarLink(reminder) {
  const response = await googleCalendar.openEvent(reminder);
  return response.ok ? response.data.url : googleCalendar.GOOGLE_CALENDAR_URL;
}
