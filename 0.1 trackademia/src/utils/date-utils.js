/** Display formatting for dates and times. Storage/conversion lives on the server. */
import { DateTime } from 'luxon';

export function formatLocalDate(isoDate, { weekday = true } = {}) {
  if (!isoDate) return '';
  const value = DateTime.fromISO(isoDate);
  if (!value.isValid) return '';
  const today = DateTime.now().startOf('day');
  const diff = Math.round(value.startOf('day').diff(today, 'days').days);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return value.toFormat(weekday ? (value.year === today.year ? 'ccc, LLL d' : 'ccc, LLL d, yyyy') : 'LLL d, yyyy');
}

export function formatTime(hhmm) {
  if (!hhmm) return '';
  const value = DateTime.fromFormat(hhmm, 'HH:mm');
  return value.isValid ? value.toFormat('h:mm a') : hhmm;
}

/** "Wed, Nov 4 · 10:00 AM – 11:00 AM" from a reminder's local fields. */
export function formatReminderWhen(reminder) {
  const local = reminder.local || {};
  const date = formatLocalDate(local.start_date);
  if (reminder.all_day) {
    return local.end_date && local.end_date !== local.start_date ? `${date} – ${formatLocalDate(local.end_date)} · All day` : `${date} · All day`;
  }
  const end = local.end_time ? ` – ${formatTime(local.end_time)}` : '';
  return `${date} · ${formatTime(local.start_time)}${end}`;
}

/** Local date/time fields for a reminder summary that only has UTC instants. */
export function localFieldsFromInstants({ start_datetime: start, end_datetime: end, timezone, all_day: allDay }) {
  const s = DateTime.fromISO(start, { zone: 'utc' }).setZone(timezone || 'local');
  const e = DateTime.fromISO(end, { zone: 'utc' }).setZone(timezone || 'local');
  return {
    start_date: s.toISODate(),
    start_time: allDay ? null : s.toFormat('HH:mm'),
    end_date: (allDay ? e.minus({ days: 1 }) : e).toISODate(),
    end_time: allDay ? null : e.toFormat('HH:mm'),
  };
}

/** Relative "edited 5 min ago" style labels. */
export function formatRelative(iso) {
  if (!iso) return '';
  const value = DateTime.fromISO(iso);
  if (!value.isValid) return '';
  const seconds = DateTime.now().diff(value, 'seconds').seconds;
  if (seconds < 45) return 'just now';
  return value.toRelative({ style: 'short' }) || value.toFormat('LLL d');
}

export function formatTimestamp(iso) {
  const value = DateTime.fromISO(iso);
  return value.isValid ? value.toFormat("LLL d, yyyy 'at' h:mm a") : '';
}

export function addMinutesToTime(hhmm, minutes) {
  const value = DateTime.fromFormat(hhmm || '', 'HH:mm');
  return value.isValid ? value.plus({ minutes }).toFormat('HH:mm') : '';
}

export function todayISO(zone) {
  return DateTime.now().setZone(zone || 'local').toISODate();
}
