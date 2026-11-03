export const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value) => String(value).padStart(2, '0');

export function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Local calendar date as YYYY-MM-DD (never UTC-shifted). */
export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalISODateTime(date) {
  return `${toISODate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetween(from, to) {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86400000);
}

/** Next date that falls on `weekday` (0 = Sunday). Today counts only when includeToday is true. */
export function nextWeekday(from, weekday, { includeToday = false } = {}) {
  const base = startOfDay(from);
  let diff = (weekday - base.getDay() + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(base, diff);
}

/** Converts a 12-hour clock value to "HH:MM". Returns null for impossible times. */
export function to24Hour(hour, minute = 0, meridiem = '') {
  const period = meridiem.replace(/\./g, '').toLowerCase();
  let h = Number(hour);
  const m = Number(minute);
  if (Number.isNaN(h) || Number.isNaN(m) || m > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${pad(h)}:${pad(m)}`;
}

export function formatTime12(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!match) return '';
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${match[2]} ${suffix}`;
}

export function formatClock(date = new Date()) {
  const hours = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12;
  return `${hours}:${pad(date.getMinutes())}`;
}

/** "Today", "Tomorrow", "Yesterday", or "Mon, Nov 9". */
export function formatDayLabel(isoDate, now = new Date()) {
  const date = parseISODate(isoDate);
  if (!date) return '';
  const diff = daysBetween(now, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const yearSuffix = date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : '';
  return `${SHORT_WEEKDAYS[date.getDay()]}, ${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}${yearSuffix}`;
}

/** "Tomorrow, Nov 4" for relative days, otherwise "Mon, Nov 9". */
export function formatFriendlyDate(isoDate, now = new Date()) {
  const date = parseISODate(isoDate);
  if (!date) return '';
  const label = formatDayLabel(isoDate, now);
  const isRelative = ['Today', 'Tomorrow', 'Yesterday'].includes(label);
  return isRelative ? `${label}, ${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}` : label;
}

export function formatLongDate(isoDate) {
  const date = parseISODate(isoDate);
  if (!date) return '';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** Compact timestamp for lists: "9:41 AM", "Yesterday", "Oct 30". */
export function formatTimestamp(value, now = new Date()) {
  const date = parseDateTime(value);
  if (!date) return '';
  const diff = daysBetween(date, now);
  if (diff === 0) return formatTime12(`${date.getHours()}:${pad(date.getMinutes())}`);
  if (diff === 1) return 'Yesterday';
  const yearSuffix = date.getFullYear() !== now.getFullYear() ? `, ${date.getFullYear()}` : '';
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}${yearSuffix}`;
}

export function formatDateTime(value) {
  const date = parseDateTime(value);
  if (!date) return '';
  const time = formatTime12(`${date.getHours()}:${pad(date.getMinutes())}`);
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} · ${time}`;
}
