export const STORAGE_KEYS = Object.freeze({
  notes: 'trackademia_notes',
  reminders: 'trackademia_reminders',
  user: 'trackademia_user',
  settings: 'trackademia_settings',
});

function createMemoryArea() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/** Returns a usable Web Storage area, or an in-memory fallback when storage is blocked. */
function resolveArea(kind) {
  try {
    const area = kind === 'session' ? window.sessionStorage : window.localStorage;
    const probe = '__trackademia_probe__';
    area.setItem(probe, '1');
    area.removeItem(probe);
    return area;
  } catch {
    return createMemoryArea();
  }
}

let area = resolveArea('local');
let sandboxed = false;

/**
 * Embedded presentation frames use sessionStorage so that playing with the
 * wireframes never touches the data of the standalone app.
 */
export function useSandboxStorage() {
  area = resolveArea('session');
  sandboxed = true;
}

export function isSandboxed() {
  return sandboxed;
}

export function isOwnKey(key) {
  return Object.values(STORAGE_KEYS).includes(key);
}

function read(key, fallback) {
  try {
    const raw = area.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) area.removeItem(key);
    else area.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* Notes ------------------------------------------------------------------ */

/** Returns null when notes were never stored, so callers can seed sample data. */
export function getNotes() {
  const notes = read(STORAGE_KEYS.notes, null);
  return Array.isArray(notes) ? notes : null;
}

export function saveNotes(notes) {
  write(STORAGE_KEYS.notes, notes);
  saveReminders(
    notes
      .filter((note) => note.reminder)
      .map((note) => ({ ...note.reminder, noteId: note.id })),
  );
}

export function getNote(id) {
  return (getNotes() || []).find((note) => note.id === id) || null;
}

export function saveNote(note) {
  const notes = getNotes() || [];
  const index = notes.findIndex((item) => item.id === note.id);
  if (index === -1) notes.unshift(note);
  else notes[index] = note;
  saveNotes(notes);
  return note;
}

export function updateNote(id, patch) {
  const note = getNote(id);
  if (!note) return null;
  return saveNote({ ...note, ...patch });
}

export function deleteNote(id) {
  const notes = getNotes() || [];
  saveNotes(notes.filter((note) => note.id !== id));
}

/* Reminders (a denormalised index of the reminders embedded in notes) ---- */

export function getReminders() {
  return read(STORAGE_KEYS.reminders, []);
}

export function saveReminders(reminders) {
  write(STORAGE_KEYS.reminders, reminders);
}

/* User & settings -------------------------------------------------------- */

export function getUser() {
  return read(STORAGE_KEYS.user, null);
}

export function saveUser(user) {
  write(STORAGE_KEYS.user, user);
}

export function getSettings() {
  return read(STORAGE_KEYS.settings, {});
}

export function saveSettings(settings) {
  write(STORAGE_KEYS.settings, settings);
}

/* Whole-state helpers ---------------------------------------------------- */

export function restoreSnapshot() {
  return { notes: getNotes(), user: getUser(), settings: getSettings() };
}

export function clearAppData() {
  Object.values(STORAGE_KEYS).forEach((key) => write(key, null));
}

/** Clears the presentation sandbox and optionally seeds its settings. */
export function resetSandbox(seedSettings = null) {
  const session = resolveArea('session');
  Object.values(STORAGE_KEYS).forEach((key) => session.removeItem(key));
  if (seedSettings) session.setItem(STORAGE_KEYS.settings, JSON.stringify(seedSettings));
}
