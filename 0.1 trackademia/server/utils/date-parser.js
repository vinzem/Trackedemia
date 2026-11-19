/**
 * Server-side date utilities. The deterministic parser lives in /shared so the
 * browser and the API use exactly the same rules; this module adds conversions
 * between local wall-clock values and stored UTC instants.
 */
import { DateTime } from 'luxon';

export {
  parseSchedulingText,
  finalizeEvent,
  findTextRange,
  hasDateCue,
  hasTimeCue,
  isValidTimezone,
  segmentText,
  TEMPORAL_CUE,
} from '../../shared/date-parser.js';

export const DEFAULT_EVENT_MINUTES = 60;

/**
 * Converts local reminder input into UTC instants.
 * @param {{start_date:string,start_time?:string|null,end_date?:string|null,end_time?:string|null,all_day?:boolean,timezone:string}} input
 */
export function toEventWindow({ start_date, start_time, end_date, end_time, all_day, timezone }) {
  if (all_day) {
    const start = DateTime.fromISO(start_date, { zone: timezone }).startOf('day');
    let end = end_date ? DateTime.fromISO(end_date, { zone: timezone }).startOf('day').plus({ days: 1 }) : start.plus({ days: 1 });
    if (end <= start) end = start.plus({ days: 1 });
    return { start, end, allDay: true };
  }
  const start = DateTime.fromISO(`${start_date}T${start_time}`, { zone: timezone });
  let end;
  if (end_time) {
    end = DateTime.fromISO(`${end_date || start_date}T${end_time}`, { zone: timezone });
    if (end <= start && !end_date) end = end.plus({ days: 1 });
  } else {
    end = start.plus({ minutes: DEFAULT_EVENT_MINUTES });
  }
  return { start, end, allDay: false };
}

/** Splits stored UTC instants back into local date/time fields for the client. */
export function toLocalFields({ start_datetime, end_datetime, timezone, all_day }) {
  const start = DateTime.fromISO(start_datetime, { zone: 'utc' }).setZone(timezone);
  const end = DateTime.fromISO(end_datetime, { zone: 'utc' }).setZone(timezone);
  const inclusiveEnd = all_day ? end.minus({ days: 1 }) : end;
  return {
    start_date: start.toISODate(),
    start_time: all_day ? null : start.toFormat('HH:mm'),
    end_date: inclusiveEnd.toISODate(),
    end_time: all_day ? null : end.toFormat('HH:mm'),
  };
}

export function nowInZone(timezone) {
  return DateTime.now().setZone(timezone);
}
