/** Reminders API client. */
import { api } from '../../services/api-client.js';

export const listReminders = (query = {}) => api.get('/api/reminders', { query }).then((res) => res.data);
export const getReminder = (id) => api.get(`/api/reminders/${id}`).then((res) => res.data);
export const createReminder = (payload) => api.post('/api/reminders', payload).then((res) => res.data);
export const updateReminder = (id, patch) => api.patch(`/api/reminders/${id}`, patch).then((res) => res.data);
export const syncReminder = (id) => api.post(`/api/reminders/${id}/sync`).then((res) => res.data);
export const deleteReminder = (id, { keepEvent = false } = {}) => api.delete(`/api/reminders/${id}`, { query: keepEvent ? { keep_event: 'true' } : {} }).then((res) => res.data);
