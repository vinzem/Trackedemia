/**
 * Event detection: server-side AI extraction with a local deterministic
 * fallback (same rules the server uses) when offline or unavailable.
 */
import { parseSchedulingText, TEMPORAL_CUE } from '../../../shared/date-parser.js';
import { api } from '../../services/api-client.js';

export function detectLocally(text, timezone) {
  return { ...parseSchedulingText(text, { timezone }), engine: 'local' };
}

export function mightContainEvent(text) {
  return TEMPORAL_CUE.test(text || '');
}

/** Calls POST /api/ai/extract-reminders; falls back to local parsing on failure. */
export async function extractReminders(text, { timezone, noteId, signal } = {}) {
  try {
    const { data } = await api.post('/api/ai/extract-reminders', { text, timezone, ...(noteId ? { note_id: noteId } : {}) }, { signal });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return { ...detectLocally(text, timezone), fallback_reason: error.code || 'request_failed' };
  }
}
