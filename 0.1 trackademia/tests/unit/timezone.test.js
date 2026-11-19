import { describe, expect, it } from 'vitest';
import { parseSchedulingText } from '../../shared/date-parser.js';
import { toEventWindow, toLocalFields } from '../../server/utils/date-parser.js';

describe('timezone handling', () => {
  it('resolves relative dates in the user timezone, not the server timezone', () => {
    const now = '2026-11-03T20:00:00Z'; // Nov 4, 04:00 in Manila; Nov 3, 15:00 in New York
    expect(parseSchedulingText('Call tomorrow at 9am', { now, timezone: 'Asia/Manila' }).events[0].start_date).toBe('2026-11-05');
    expect(parseSchedulingText('Call tomorrow at 9am', { now, timezone: 'America/New_York' }).events[0].start_date).toBe('2026-11-04');
  });

  it('falls back to UTC for invalid timezones', () => {
    expect(parseSchedulingText('x today at 1pm', { now: '2026-11-03T00:00:00Z', timezone: 'Bad/Zone' }).timezone).toBe('UTC');
  });

  it('converts local wall-clock input to UTC and back', () => {
    const window = toEventWindow({ start_date: '2026-11-04', start_time: '10:00', timezone: 'Asia/Manila' });
    expect(window.start.toUTC().toISO()).toBe('2026-11-04T02:00:00.000Z');
    expect(window.end.diff(window.start, 'minutes').minutes).toBe(60);
    const local = toLocalFields({ start_datetime: window.start.toUTC().toISO(), end_datetime: window.end.toUTC().toISO(), timezone: 'Asia/Manila', all_day: false });
    expect(local).toEqual({ start_date: '2026-11-04', start_time: '10:00', end_date: '2026-11-04', end_time: '11:00' });
  });

  it('handles daylight-saving transitions', () => {
    // US DST ends 2026-11-01 at 02:00; a 1:30am event that day is ambiguous but must stay valid.
    const before = toEventWindow({ start_date: '2026-10-31', start_time: '09:00', timezone: 'America/New_York' });
    const after = toEventWindow({ start_date: '2026-11-02', start_time: '09:00', timezone: 'America/New_York' });
    expect(before.start.toUTC().hour).toBe(13);
    expect(after.start.toUTC().hour).toBe(14);
  });

  it('treats overnight end times as next day and all-day events as exclusive ends', () => {
    const night = toEventWindow({ start_date: '2026-11-06', start_time: '22:00', end_time: '01:00', timezone: 'UTC' });
    expect(night.end.toISO()).toContain('2026-11-07T01:00');
    const allDay = toEventWindow({ start_date: '2026-11-15', all_day: true, timezone: 'Asia/Manila' });
    expect(allDay.end.toISODate()).toBe('2026-11-16');
    expect(toLocalFields({ start_datetime: allDay.start.toUTC().toISO(), end_datetime: allDay.end.toUTC().toISO(), timezone: 'Asia/Manila', all_day: true }).end_date).toBe('2026-11-15');
  });
});
