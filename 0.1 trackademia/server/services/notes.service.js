/** Notes persistence. All queries are scoped to the caller (RLS + explicit user filter). */
import { conflict, fromDatabaseError, notFound } from '../utils/errors.js';

const NOTE_COLUMNS = 'id, user_id, title, content, created_at, updated_at';
export const REMINDER_SUMMARY_COLUMNS = 'id, note_id, event_title, start_datetime, end_datetime, all_day, timezone, source_text';

const SORTS = {
  updated_desc: ['updated_at', false],
  updated_asc: ['updated_at', true],
  created_desc: ['created_at', false],
  created_asc: ['created_at', true],
  title_asc: ['title', true],
};

/** Escapes characters that are meaningful inside a PostgREST `or` / `ilike` filter. */
export function escapeSearchTerm(term) {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()."]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function attachReminders(db, userId, notes) {
  if (!notes.length) return notes;
  const { data, error } = await db.from('reminders')
    .select(REMINDER_SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .in('note_id', notes.map((note) => note.id))
    .order('start_datetime', { ascending: true });
  if (error) throw fromDatabaseError(error, 'Reminders');
  const byNote = new Map();
  data.forEach((reminder) => {
    if (!byNote.has(reminder.note_id)) byNote.set(reminder.note_id, []);
    byNote.get(reminder.note_id).push({ ...reminder, status: 'saved' });
  });
  return notes.map((note) => ({ ...note, reminders: byNote.get(note.id) || [] }));
}

export async function listNotes(db, userId, { q, sort = 'updated_desc', limit = 50, offset = 0 } = {}) {
  const [column, ascending] = SORTS[sort] || SORTS.updated_desc;
  let query = db.from('notes').select(NOTE_COLUMNS, { count: 'exact' }).eq('user_id', userId);
  const term = q ? escapeSearchTerm(q) : '';
  if (term) query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  const { data, error, count } = await query.order(column, { ascending }).range(offset, offset + limit - 1);
  if (error) throw fromDatabaseError(error, 'Notes');
  return { notes: await attachReminders(db, userId, data || []), total: count ?? (data || []).length };
}

export async function getNote(db, userId, id) {
  const { data, error } = await db.from('notes').select(NOTE_COLUMNS).eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw fromDatabaseError(error, 'Note');
  if (!data) throw notFound('Note');
  const [withReminders] = await attachReminders(db, userId, [data]);
  return withReminders;
}

export async function createNote(db, userId, { title = '', content = '' }) {
  const { data, error } = await db.from('notes').insert({ user_id: userId, title, content }).select(NOTE_COLUMNS).single();
  if (error) throw fromDatabaseError(error, 'Note');
  return { ...data, reminders: [] };
}

export async function updateNote(db, userId, id, { title, content, expected_updated_at: expected }) {
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = content;
  if (expected) {
    // Optimistic concurrency: refuse to overwrite edits made on another device.
    const current = await getNote(db, userId, id);
    if (new Date(current.updated_at).getTime() > new Date(expected).getTime()) {
      throw conflict('This note was changed on another device. Reload to see the latest version.', { current });
    }
  }
  const { data, error } = await db.from('notes').update(patch).eq('user_id', userId).eq('id', id).select(NOTE_COLUMNS).maybeSingle();
  if (error) throw fromDatabaseError(error, 'Note');
  if (!data) throw notFound('Note');
  const [withReminders] = await attachReminders(db, userId, [data]);
  return withReminders;
}

export async function deleteNote(db, userId, id) {
  const { data, error } = await db.from('notes').delete().eq('user_id', userId).eq('id', id).select('id').maybeSingle();
  if (error) throw fromDatabaseError(error, 'Note');
  if (!data) throw notFound('Note');
  return { id };
}
