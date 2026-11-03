import { getState, setState } from '../state.js';
import { getNoteById, updateNote } from './notes.js';
import {
  AVAILABLE_CALENDARS,
  getDefaultCalendar,
  removeCalendarEvent,
  syncReminderToCalendar,
  updateCalendarEvent,
} from './calendar-sync.js';
import { generateId } from '../utils/helpers.js';
import { addDays, formatDayLabel, formatFriendlyDate, formatTime12, startOfDay, toISODate } from '../utils/date-utils.js';
import { validateReminder } from '../utils/validation.js';

export const DEFAULT_REMINDER_TIME = '09:00';

export const REMINDER_STATUS = Object.freeze({
  draft: 'draft',
  linked: 'linked',
});

/** Turns detection output (or nothing) into an editable reminder draft. */
export function buildReminderDraft(detection, { noteId = null, fallbackTitle = '' } = {}) {
  const found = detection?.found;
  return {
    id: generateId('reminder'),
    noteId,
    title: (found && detection.title) || fallbackTitle || 'New reminder',
    date: (found && detection.date) || toISODate(addDays(startOfDay(new Date()), 1)),
    time: (found && detection.time) || DEFAULT_REMINDER_TIME,
    calendar: getDefaultCalendar(),
    status: REMINDER_STATUS.draft,
    sourceText: found ? detection.expression : '',
  };
}

export function setActiveReminder(draft) {
  setState({ activeReminder: draft });
}

export function getActiveReminder() {
  return getState().activeReminder;
}

export function clearActiveReminder() {
  setState({ activeReminder: null });
}

export function validateReminderDraft(draft) {
  return validateReminder(draft, { calendars: [...AVAILABLE_CALENDARS] });
}

function toLinkedReminder(draft, eventData) {
  return {
    id: draft.id || generateId('reminder'),
    title: draft.title.trim(),
    date: draft.date,
    time: draft.time,
    calendar: draft.calendar,
    status: REMINDER_STATUS.linked,
    eventId: eventData.eventId,
    htmlLink: eventData.htmlLink,
  };
}

/** Creates the (simulated) calendar event and links the reminder to its note. */
export async function confirmReminder(noteId, draft) {
  const { valid, errors } = validateReminderDraft(draft);
  if (!valid) return { ok: false, errors };
  if (!getNoteById(noteId)) return { ok: false, errors: { note: 'Note not found.' } };

  const response = await syncReminderToCalendar(draft);
  if (!response.ok) return { ok: false, errors: { calendar: response.error?.message || 'Could not reach Google Calendar.' } };

  const reminder = toLinkedReminder(draft, response.data);
  updateNote(noteId, { reminder });
  clearActiveReminder();
  return { ok: true, reminder, connectedNow: Boolean(response.connectedNow) };
}

export async function editReminder(noteId, changes) {
  const note = getNoteById(noteId);
  if (!note?.reminder) return { ok: false, errors: { note: 'This note has no reminder.' } };
  const draft = { ...note.reminder, ...changes };
  const { valid, errors } = validateReminderDraft(draft);
  if (!valid) return { ok: false, errors };

  const response = await updateCalendarEvent(draft);
  if (!response.ok) return { ok: false, errors: { calendar: response.error?.message || 'Could not update the event.' } };
  const reminder = toLinkedReminder(draft, response.data);
  updateNote(noteId, { reminder });
  return { ok: true, reminder };
}

/** Removes the reminder and its event. Returns the removed reminder so callers can offer undo. */
export async function removeReminder(noteId) {
  const note = getNoteById(noteId);
  if (!note?.reminder) return { ok: false, removed: null };
  const removed = note.reminder;
  const response = await removeCalendarEvent(removed.eventId);
  if (!response.ok) return { ok: false, removed: null };
  updateNote(noteId, { reminder: null });
  return { ok: true, removed };
}

export async function restoreReminder(noteId, reminder) {
  return confirmReminder(noteId, { ...reminder, status: REMINDER_STATUS.draft });
}

export function formatReminderDate(reminder, now = new Date()) {
  return formatFriendlyDate(reminder?.date, now);
}

export function formatReminderTime(reminder) {
  return formatTime12(reminder?.time);
}

/** "Tomorrow, 10:00 AM" */
export function formatReminderSummary(reminder, now = new Date()) {
  if (!reminder) return '';
  return `${formatDayLabel(reminder.date, now)}, ${formatTime12(reminder.time)}`;
}

export function getReminderStatusLabel(reminder) {
  if (!reminder) return 'Not linked';
  return reminder.status === REMINDER_STATUS.linked ? 'Synced · simulated' : 'Draft';
}
