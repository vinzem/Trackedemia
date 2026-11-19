/**
 * Defensive localStorage wrapper for per-device conveniences only
 * (unsaved draft backup, UI preferences). Never stores tokens or secrets.
 */
const PREFIX = 'trackademia:';

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

export const storage = {
  get(key, fallback = null) {
    return safe(() => {
      const value = localStorage.getItem(PREFIX + key);
      return value == null ? fallback : JSON.parse(value);
    }, fallback);
  },
  set(key, value) {
    safe(() => localStorage.setItem(PREFIX + key, JSON.stringify(value)));
  },
  remove(key) {
    safe(() => localStorage.removeItem(PREFIX + key));
  },
  /** Removes every Trackademia key (used on sign-out). */
  clear() {
    safe(() => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)));
  },
};

export const draftKey = (noteId) => `draft:${noteId || 'new'}`;
