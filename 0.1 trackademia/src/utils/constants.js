export const ROUTES = Object.freeze({
  onboarding: '/onboarding',
  resetPassword: '/reset-password',
  authCallback: '/auth/callback',
  notes: '/notes',
  newNote: '/notes/new',
  note: (id) => `/notes/${id}`,
  editNote: (id) => `/notes/${id}/edit`,
  settings: '/settings',
});

export const AUTOSAVE_DELAY_MS = 1200;
export const LOCAL_DETECTION_DELAY_MS = 150;
export const AI_DETECTION_DELAY_MS = 1500;
export const UNDO_WINDOW_MS = 10000;

export const NOTE_SORTS = [
  { value: 'updated_desc', label: 'Recently edited' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'title_asc', label: 'Title A–Z' },
];

export const REMINDER_STATUS = Object.freeze({
  pending: { label: 'Not synced', tone: 'neutral' },
  syncing: { label: 'Syncing…', tone: 'neutral' },
  synced: { label: 'On Google Calendar', tone: 'success' },
  failed: { label: 'Sync failed', tone: 'error' },
});

export const LIMITS = Object.freeze({ title: 200, content: 50000, eventTitle: 200, description: 5000 });
