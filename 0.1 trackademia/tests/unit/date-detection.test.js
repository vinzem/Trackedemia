import { describe, expect, it } from 'vitest';
import { findTextRange, hasDateCue, hasTimeCue, parseSchedulingText, segmentText } from '../../shared/date-parser.js';

const NOW = '2026-11-03T12:30:00+08:00'; // Tuesday, Asia/Manila
const parse = (text, opts = {}) => parseSchedulingText(text, { now: NOW, timezone: 'Asia/Manila', ...opts });
const first = (text, opts) => parse(text, opts).events[0];

describe('deterministic date detection', () => {
  it.each([
    ['Dentist appointment tomorrow at 10am.', 'Dentist appointment', '2026-11-04T10:00:00', 'tomorrow at 10am'],
    ['Submit thesis draft next Monday at 3pm.', 'Submit thesis draft', '2026-11-09T15:00:00', 'next Monday at 3pm'],
    ['Meeting with Sarah on November 10 at 9am.', 'Meeting with Sarah', '2026-11-10T09:00:00', 'November 10 at 9am'],
    ['Project review in two hours.', 'Project review', '2026-11-03T14:30:00', 'in two hours'],
    ['Exam 2026-12-01 at 08:30', 'Exam', '2026-12-01T08:30:00', '2026-12-01 at 08:30'],
    ['Lunch with Ana at noon on Friday', 'Lunch with Ana', '2026-11-06T12:00:00', 'noon on Friday'],
    ['Quiz 11/20 at 1:15 pm', 'Quiz', '2026-11-20T13:15:00', '11/20 at 1:15 pm'],
    ['Group call on 5th December at 7pm', 'Group call', '2026-12-05T19:00:00', '5th December at 7pm'],
  ])('%s', (text, title, start, source) => {
    const event = first(text);
    expect(event.event_title).toBe(title);
    expect(event.start_datetime).toBe(start);
    expect(event.source_text).toBe(source);
    expect(event.missing_fields).toEqual([]);
    expect(event.confidence).toBeGreaterThanOrEqual(0.8);
    expect(text.slice(event.range.start, event.range.end)).toBe(source);
  });

  it('flags vague parts of day as missing time instead of inventing one', () => {
    const event = first('Call the supplier Friday afternoon.');
    expect(event).toMatchObject({ start_date: '2026-11-06', start_time: null, start_datetime: null, time_hint: 'afternoon' });
    expect(event.missing_fields).toEqual(['start_time']);
    expect(event.clarification).toMatch(/afternoon/);
  });

  it('resolves "the 15th" to the next occurrence and leaves time missing', () => {
    expect(first('Pay electricity bill on the 15th.')).toMatchObject({ event_title: 'Pay electricity bill', start_date: '2026-11-15', missing_fields: ['start_time'] });
    expect(first('Rent due the 2nd', { now: '2026-11-03T08:00:00+08:00' }).start_date).toBe('2026-12-02');
  });

  it('asks for clarification on an ambiguous hour', () => {
    const event = first('Gym tomorrow at 6');
    expect(event.start_date).toBe('2026-11-04');
    expect(event.start_time).toBeNull();
    expect(event.clarification).toMatch(/6 AM or 6 PM/);
  });

  it('never invents a date when only a time is present', () => {
    const event = first('Remind me to call mom at 5pm');
    expect(event).toMatchObject({ event_title: 'Call mom', start_date: null, start_time: '17:00', missing_fields: ['start_date'] });
  });

  it('detects multiple events in one note', () => {
    const { events } = parse('Team sync 2-4pm on Nov 12. Lunch with Ana at 12:30 tomorrow\nRead chapter 3');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event_title: 'Team sync', start_datetime: '2026-11-12T14:00:00', end_datetime: '2026-11-12T16:00:00', duration_minutes: 120 });
    expect(events[1]).toMatchObject({ event_title: 'Lunch with Ana', start_datetime: '2026-11-04T12:30:00' });
  });

  it('parses durations and ranges', () => {
    expect(first('Standup tomorrow 9:30am for 15 minutes')).toMatchObject({ end_datetime: '2026-11-04T09:45:00', duration_minutes: 15 });
    expect(first('Shift Friday 10pm to 2am')).toMatchObject({ start_datetime: '2026-11-06T22:00:00', end_datetime: '2026-11-07T02:00:00' });
    expect(first('Seminar 11-1pm on Thursday')).toMatchObject({ start_time: '11:00', end_time: '13:00' });
  });

  it('distinguishes past and future', () => {
    expect(first('Yesterday I met John').is_past).toBe(true);
    expect(first('Met the advisor last Friday').is_past).toBe(true);
    expect(first('Lecture today at 9am').is_past).toBe(true); // 9am already passed at 12:30
    expect(first('Lecture today at 5pm').is_past).toBe(false);
    expect(first('Recap of Oct 30 class').is_past).toBe(true); // within 30 days: past reference
    expect(first('Conference on March 3').start_date).toBe('2027-03-03'); // rolls forward
  });

  it('returns nothing for text without scheduling information', () => {
    expect(parse('Photosynthesis converts light into chemical energy.').detected).toBe(false);
    expect(parse('').events).toEqual([]);
    expect(parse(null).events).toEqual([]);
  });

  it('rejects impossible dates', () => {
    expect(parse('Party on February 30').detected).toBe(false);
    expect(parse('Meet at 13pm').detected).toBe(false);
  });

  it('exposes helpers used to validate AI output', () => {
    expect(hasTimeCue('Friday afternoon')).toBe(false);
    expect(hasTimeCue('at 3:30')).toBe(true);
    expect(hasDateCue('next Monday')).toBe(true);
    expect(hasDateCue('Buy milk')).toBe(false);
    expect(findTextRange('Call  Friday Afternoon now', 'friday afternoon')).toEqual({ start: 6, end: 22 });
    expect(segmentText('One. Two!\nThree').map((s) => s.text)).toEqual(['One.', 'Two!', 'Three']);
  });
});
