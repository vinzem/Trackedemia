/**
 * Tiny observable store for app-wide state. Feature modules update it; UI
 * components subscribe to the slices they render.
 */
const listeners = new Set();

const state = {
  session: null,
  user: null,
  profile: null,
  calendar: { loaded: false, configured: true, connected: false, needs_reconnect: false, google_account_email: null },
  calendars: [],
  notesQuery: { q: '', sort: 'updated_desc' },
};

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetState() {
  setState({
    session: null, user: null, profile: null, calendars: [],
    calendar: { loaded: false, configured: true, connected: false, needs_reconnect: false, google_account_email: null },
  });
}
