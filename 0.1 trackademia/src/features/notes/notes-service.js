/** Notes API client. */
import { api } from '../../services/api-client.js';

export const listNotes = (query = {}, options) => api.get('/api/notes', { ...options, query });
export const getNote = (id) => api.get(`/api/notes/${encodeURIComponent(id)}`).then((res) => res.data);
export const createNote = (note) => api.post('/api/notes', note).then((res) => res.data);
export const updateNote = (id, patch) => api.patch(`/api/notes/${encodeURIComponent(id)}`, patch).then((res) => res.data);
export const deleteNote = (id) => api.delete(`/api/notes/${encodeURIComponent(id)}`).then((res) => res.data);
