import { getState, setState, resetToSampleData } from '../state.js';
import { detectReminder } from './date-detection.js';
import { generateId, toTitleCase, truncate } from '../utils/helpers.js';
import { toLocalISODateTime } from '../utils/date-utils.js';
import { validateNoteContent } from '../utils/validation.js';

export const DEMO_NOTE_TEXT = 'Dentist appointment tomorrow at 10am';
export const UNTITLED_NOTE = 'Untitled note';

const nowStamp = () => toLocalISODateTime(new Date());

/** Title from the detected event description, falling back to the first line. */
export function deriveTitle(content = '') {
  const detection = detectReminder(content);
  if (detection.found && detection.title) return toTitleCase(detection.title);
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) || '';
  return firstLine ? truncate(firstLine, 48) : UNTITLED_NOTE;
}

/** Body preview that skips the first line when it simply repeats the title. */
export function getNoteSnippet(note, max = 90) {
  const lines = (note.content || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].toLowerCase().startsWith((note.title || '').toLowerCase().slice(0, 12))) {
    lines.shift();
  }
  return truncate(lines.join(' '), max);
}

export function getNoteStats(note) {
  const content = note?.content || '';
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return { words, characters: content.length };
}

export function getNotes() {
  return [...getState().notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function getNoteById(id) {
  if (!id) return null;
  return getState().notes.find((note) => note.id === id) || null;
}

export function selectNote(id) {
  setState({ selectedNoteId: id });
}

/** Note to show when a page is opened without an explicit id. */
export function resolveNote(id, { preferLinked = false } = {}) {
  const { selectedNoteId, notes } = getState();
  return getNoteById(id)
    || getNoteById(selectedNoteId)
    || (preferLinked ? notes.find((note) => note.reminder) : null)
    || notes[0]
    || null;
}

export function createNote({ content, title, attachments = [] }) {
  const check = validateNoteContent(content);
  if (!check.valid) throw new Error(check.error);
  const timestamp = nowStamp();
  const note = {
    id: generateId('note'),
    title: title || deriveTitle(content),
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
    attachments,
    reminder: null,
  };
  setState({ notes: [note, ...getState().notes], selectedNoteId: note.id });
  return note;
}

export function updateNote(id, patch) {
  const { notes } = getState();
  const current = notes.find((note) => note.id === id);
  if (!current) throw new Error('Note not found.');
  if ('content' in patch) {
    const check = validateNoteContent(patch.content);
    if (!check.valid) throw new Error(check.error);
  }
  const contentChanged = 'content' in patch && patch.content !== current.content;
  const updated = {
    ...current,
    ...patch,
    title: patch.title || (contentChanged ? deriveTitle(patch.content) : current.title),
    updatedAt: nowStamp(),
  };
  setState({ notes: notes.map((note) => (note.id === id ? updated : note)) });
  return updated;
}

/** Creates or updates depending on whether an id is given. */
export function saveNote({ id = null, content, attachments }) {
  const patch = attachments ? { content, attachments } : { content };
  const note = id && getNoteById(id) ? updateNote(id, patch) : createNote(patch);
  selectNote(note.id);
  return note;
}

export function deleteNote(id) {
  const { notes, selectedNoteId } = getState();
  const removed = notes.find((note) => note.id === id) || null;
  setState({
    notes: notes.filter((note) => note.id !== id),
    selectedNoteId: selectedNoteId === id ? null : selectedNoteId,
  });
  return removed;
}

export function restoreNote(note) {
  if (!note) return;
  setState({ notes: [note, ...getState().notes.filter((item) => item.id !== note.id)] });
}

export function clearAllNotes() {
  setState({ notes: [], selectedNoteId: null, activeReminder: null });
}

export function restoreSampleNotes() {
  resetToSampleData();
}

export function createAttachment(kind) {
  const count = Math.floor(Math.random() * 90) + 10;
  const name = kind === 'photo' ? `photo-${count}.jpg` : `document-${count}.pdf`;
  return { id: generateId('att'), kind, name, placeholder: true };
}
