import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { isDueWithinDays } from '../../src/utils/date-utils.js';

describe('reminder due-date warning window', () => {
  const now = DateTime.fromISO('2026-11-19T23:30:00+08:00');
  const reminder = (date, timezone = 'Asia/Manila') => ({
    timezone,
    local: { start_date: date },
  });

  it('includes today and the next two calendar days', () => {
    expect(isDueWithinDays(reminder('2026-11-19'), { now })).toBe(true);
    expect(isDueWithinDays(reminder('2026-11-21'), { now })).toBe(true);
  });

  it('excludes dates more than two days away and past dates', () => {
    expect(isDueWithinDays(reminder('2026-11-22'), { now })).toBe(false);
    expect(isDueWithinDays(reminder('2026-11-26'), { now })).toBe(false);
    expect(isDueWithinDays(reminder('2026-11-18'), { now })).toBe(false);
  });

  it('uses the reminder timezone when determining its due day', () => {
    expect(isDueWithinDays(reminder('2026-11-21', 'Australia/Perth'), { now })).toBe(true);
  });
});
