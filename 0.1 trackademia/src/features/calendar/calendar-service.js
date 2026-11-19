/** Google Calendar API client (all Google calls happen on the server). */
import { api } from '../../services/api-client.js';

export const getCalendarStatus = () => api.get('/api/calendar/status').then((res) => res.data);
export const listCalendars = () => api.get('/api/calendar/calendars').then((res) => res.data);
export const disconnectCalendar = () => api.post('/api/calendar/disconnect').then((res) => res.data);
export const createCalendarEvent = (reminderId) => api.post('/api/calendar/events', { reminder_id: reminderId }).then((res) => res.data);
export const updateCalendarEvent = (reminderId) => api.patch(`/api/calendar/events/${reminderId}`, {}).then((res) => res.data);
export const deleteCalendarEvent = (reminderId) => api.delete(`/api/calendar/events/${reminderId}`).then((res) => res.data);
export const getCalendarEvent = (reminderId) => api.get(`/api/calendar/events/${reminderId}`).then((res) => res.data);

/** Starts the OAuth flow: the server returns Google's consent URL. */
export async function connectCalendar(returnPath = '/settings') {
  const { data } = await api.get('/api/calendar/connect', { query: { redirect: returnPath } });
  window.location.assign(data.url);
}
