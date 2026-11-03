import * as storage from './services/storage.js';
import { addDays, nextWeekday, startOfDay, toISODate, toLocalISODateTime } from './utils/date-utils.js';
import { deepClone } from './utils/helpers.js';

/** Settings that survive page navigation (stored under trackademia_settings). */
const PERSISTED_SETTINGS = [
  'selectedNoteId',
  'activeReminder',
  'connectedCalendar',
  'calendarConnected',
  'searchQuery',
  'showAnnotations',
  'flash',
];

const DEFAULT_STATE = Object.freeze({
  user: null,
  notes: [],
  selectedNoteId: null,
  activeReminder: null,
  connectedCalendar: 'Personal',
  calendarConnected: false,
  searchQuery: '',
  currentScreen: null,
  showAnnotations: true,
  flash: null,
});

const state = deepClone(DEFAULT_STATE);
const listeners = new Set();

export function createSampleNotes(now = new Date()) {
  const today = startOfDay(now);
  const stamp = (daysAgo, hours, minutes) => {
    const date = addDays(today, -daysAgo);
    date.setHours(hours, minutes, 0, 0);
    return toLocalISODateTime(date);
  };
  const recent = toLocalISODateTime(new Date(now.getTime() - 12 * 60000));

  return [
    {
      id: 'note-001',
      title: 'Dentist Appointment',
      content: 'Dentist appointment tomorrow at 10am\nRemember to bring my insurance card.',
      createdAt: recent,
      updatedAt: recent,
      attachments: [],
      reminder: {
        id: 'reminder-001',
        title: 'Dentist appointment',
        date: toISODate(addDays(today, 1)),
        time: '10:00',
        calendar: 'Personal',
        status: 'linked',
        eventId: 'evt-sample-001',
      },
    },
    {
      id: 'note-002',
      title: 'Submit Thesis Draft',
      content: 'Submit thesis draft next Monday at 3pm\nReview chapter 3 and finalize references.',
      createdAt: stamp(1, 16, 20),
      updatedAt: stamp(1, 16, 20),
      attachments: [],
      reminder: {
        id: 'reminder-002',
        title: 'Submit thesis draft',
        date: toISODate(nextWeekday(today, 1)),
        time: '15:00',
        calendar: 'School',
        status: 'linked',
        eventId: 'evt-sample-002',
      },
    },
    {
      id: 'note-003',
      title: 'Weekly Meeting',
      content: 'Weekly meeting Friday at 2pm\nDiscuss project milestones with the team.',
      createdAt: stamp(3, 11, 5),
      updatedAt: stamp(3, 11, 5),
      attachments: [],
      reminder: null,
    },
  ];
}

/** Restores state from storage, seeding sample notes on first run. */
export function initState() {
  const storedNotes = storage.getNotes();
  const settings = storage.getSettings();

  Object.assign(state, deepClone(DEFAULT_STATE), { currentScreen: state.currentScreen });
  state.notes = storedNotes ?? createSampleNotes();
  if (!storedNotes) storage.saveNotes(state.notes);
  state.user = storage.getUser();
  PERSISTED_SETTINGS.forEach((key) => {
    if (key in settings) state[key] = settings[key];
  });
  return getState();
}

export function getState() {
  return deepClone(state);
}

function persist(changedKeys) {
  if (changedKeys.includes('notes')) storage.saveNotes(state.notes);
  if (changedKeys.includes('user')) storage.saveUser(state.user);
  if (changedKeys.some((key) => PERSISTED_SETTINGS.includes(key))) {
    const settings = {};
    PERSISTED_SETTINGS.forEach((key) => { settings[key] = state[key]; });
    storage.saveSettings(settings);
  }
}

function notify(changedKeys) {
  const snapshot = getState();
  listeners.forEach((listener) => listener(snapshot, changedKeys));
}

export function setState(patch) {
  const changedKeys = Object.keys(patch).filter((key) => key in DEFAULT_STATE);
  changedKeys.forEach((key) => { state[key] = deepClone(patch[key]); });
  persist(changedKeys);
  notify(changedKeys);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-reads storage (e.g. after another tab or frame changed it) and notifies listeners. */
export function reloadState() {
  initState();
  notify(Object.keys(DEFAULT_STATE));
}

export function resetToSampleData() {
  setState({ notes: createSampleNotes(), selectedNoteId: null, activeReminder: null, searchQuery: '' });
}

/** Returns and clears a one-time message left by the previous page. */
export function consumeFlash() {
  const flash = state.flash;
  if (flash) setState({ flash: null });
  return flash;
}
