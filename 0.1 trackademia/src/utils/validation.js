/** Client-side validation mirrors the server schemas for instant feedback. */
import { LIMITS } from './constants.js';
import { isValidTimezone } from './timezone.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateReminderForm(values) {
  const errors = {};
  const title = String(values.event_title || '').trim();
  if (!title) errors.event_title = 'Add a title for this event.';
  else if (title.length > LIMITS.eventTitle) errors.event_title = `Keep the title under ${LIMITS.eventTitle} characters.`;
  if (String(values.event_description || '').length > LIMITS.description) errors.event_description = 'Description is too long.';
  if (!DATE_RE.test(values.start_date || '') || Number.isNaN(Date.parse(`${values.start_date}T00:00:00Z`))) errors.start_date = 'Pick a date.';
  if (!values.all_day) {
    if (!TIME_RE.test(values.start_time || '')) errors.start_time = 'Pick a start time.';
    if (values.end_time && !TIME_RE.test(values.end_time)) errors.end_time = 'Use a valid end time.';
    else if (values.end_time && TIME_RE.test(values.start_time || '') && values.end_time <= values.start_time) errors.end_time = 'End time must be after the start time.';
  }
  if (!isValidTimezone(values.timezone)) errors.timezone = 'Choose a timezone.';
  if (!values.calendar_id) errors.calendar_id = 'Choose a Google Calendar.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateNoteDraft({ title = '', content = '' }) {
  const errors = {};
  if (!title.trim() && !content.trim()) errors.content = 'Write something first.';
  if (title.length > LIMITS.title) errors.title = 'Title is too long.';
  if (content.length > LIMITS.content) errors.content = 'Note is too long.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number.';
  return null;
}
