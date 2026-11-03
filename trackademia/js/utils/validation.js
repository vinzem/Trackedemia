import { parseISODate } from './date-utils.js';

export const LIMITS = {
  reminderTitle: 120,
  noteContent: 10000,
  name: 60,
};

export function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidISODate(value) {
  return parseISODate(value) !== null;
}

export function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((value || '').trim());
}

export function validateReminder(reminder = {}, { calendars = [] } = {}) {
  const errors = {};
  if (!isNonEmpty(reminder.title)) errors.title = 'Add an event title.';
  else if (reminder.title.trim().length > LIMITS.reminderTitle) errors.title = `Keep the title under ${LIMITS.reminderTitle} characters.`;
  if (!isValidISODate(reminder.date)) errors.date = 'Choose a valid date.';
  if (!isValidTime(reminder.time)) errors.time = 'Choose a valid time.';
  if (!isNonEmpty(reminder.calendar)) errors.calendar = 'Choose a calendar.';
  else if (calendars.length && !calendars.includes(reminder.calendar)) errors.calendar = 'Choose one of your calendars.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateNoteContent(content) {
  if (!isNonEmpty(content)) return { valid: false, error: 'Write something before saving.' };
  if (content.length > LIMITS.noteContent) return { valid: false, error: 'This note is too long for the prototype.' };
  return { valid: true, error: null };
}

export function validateSignUp({ name = '', email = '' } = {}) {
  const errors = {};
  if (!isNonEmpty(name)) errors.name = 'Enter your name.';
  else if (name.trim().length > LIMITS.name) errors.name = 'That name is a little long.';
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';
  return { valid: Object.keys(errors).length === 0, errors };
}
