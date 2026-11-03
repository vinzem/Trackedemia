/**
 * Deterministic scheduling-phrase detector.
 *
 * `detectReminder(text)` is the only entry point the rest of the app uses, so
 * this rule-based parser can later be replaced by an AI extraction service
 * that returns the same result shape.
 */
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addDays,
  nextWeekday,
  startOfDay,
  to24Hour,
  toISODate,
} from '../utils/date-utils.js';

const MONTH_PATTERN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY_PATTERN = WEEKDAY_NAMES.join('|');
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

function monthIndex(token) {
  const key = token.toLowerCase().slice(0, 3);
  return MONTH_NAMES.findIndex((name) => name.startsWith(key));
}

/** Builds a date for month/day, rolling into next year when it already passed. */
function resolveMonthDay(month, day, year, now) {
  if (month < 0 || day < 1 || day > 31) return null;
  const today = startOfDay(now);
  let date = new Date(year ?? today.getFullYear(), month, day);
  if (date.getMonth() !== month) return null;
  if (year == null && date < today) date = new Date(today.getFullYear() + 1, month, day);
  return date;
}

const DATE_RULES = [
  {
    type: 'relative-day',
    pattern: /\b(day after tomorrow|tomorrow|today|tonight)\b/gi,
    resolve: (match, now) => {
      const word = match[1].toLowerCase();
      const offset = { tomorrow: 1, 'day after tomorrow': 2 }[word] ?? 0;
      return { date: addDays(startOfDay(now), offset), impliedTime: word === 'tonight' ? '20:00' : null };
    },
  },
  {
    type: 'in-days',
    pattern: /\bin\s+(\d{1,2}|a|an|one|two|three|four|five|six|seven)\s+(days?|weeks?)\b/gi,
    resolve: (match, now) => {
      const amount = NUMBER_WORDS[match[1].toLowerCase()] ?? Number(match[1]);
      const days = match[2].toLowerCase().startsWith('week') ? amount * 7 : amount;
      return { date: addDays(startOfDay(now), days) };
    },
  },
  {
    type: 'weekday',
    pattern: new RegExp(`\\b(?:(next|this|on)\\s+)?(${WEEKDAY_PATTERN})\\b`, 'gi'),
    resolve: (match, now) => {
      const weekday = WEEKDAY_NAMES.indexOf(match[2].toLowerCase());
      const modifier = (match[1] || '').toLowerCase();
      return { date: nextWeekday(now, weekday, { includeToday: modifier !== 'next' }) };
    },
  },
  {
    type: 'month-day',
    pattern: new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'),
    resolve: (match, now) => ({
      date: resolveMonthDay(monthIndex(match[1]), Number(match[2]), match[3] ? Number(match[3]) : null, now),
    }),
  },
  {
    type: 'day-month',
    pattern: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})\\b(?:,?\\s+(\\d{4}))?`, 'gi'),
    resolve: (match, now) => ({
      date: resolveMonthDay(monthIndex(match[2]), Number(match[1]), match[3] ? Number(match[3]) : null, now),
    }),
  },
  {
    type: 'numeric',
    pattern: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g,
    resolve: (match, now) => {
      let year = match[3] ? Number(match[3]) : null;
      if (year !== null && year < 100) year += 2000;
      return { date: resolveMonthDay(Number(match[1]) - 1, Number(match[2]), year, now) };
    },
  },
];

const TIME_RULES = [
  {
    type: 'clock-12h',
    pattern: /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/gi,
    resolve: (match) => to24Hour(match[1], match[2] || 0, match[3]),
  },
  {
    type: 'clock-24h',
    pattern: /\b(?:at|@)\s+([01]?\d|2[0-3]):([0-5]\d)\b/gi,
    resolve: (match) => to24Hour(match[1], match[2]),
  },
  {
    type: 'named-time',
    pattern: /\b(noon|midday|midnight)\b/gi,
    resolve: (match) => (match[1].toLowerCase() === 'midnight' ? '00:00' : '12:00'),
  },
];

/** Joins adjacent matches such as "next Monday" + "at" + "3pm" into one highlight. */
const CONNECTOR = /^[\s,]*(?:at|@|by|on|from|around)?[\s,]*$/i;
const LEADING_FILLER = /^(?:(?:remind me to|remember to|don't forget to|dont forget to|reminder:?|note:?)\s+)+/i;
const TRAILING_FILLER = /(?:\s+(?:at|on|by|due|this|next|from|around|for|is|@))+\s*$/i;

function collectMatches(text, rules, kind, now) {
  const found = [];
  rules.forEach((rule) => {
    for (const match of text.matchAll(rule.pattern)) {
      const value = rule.resolve(match, now);
      const usable = kind === 'date' ? value?.date : value;
      if (!usable) continue;
      found.push({ kind, type: rule.type, start: match.index, end: match.index + match[0].length, text: match[0], value });
    }
  });
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  // Drop matches nested inside a longer one (e.g. "Monday" inside "next Monday").
  return found.filter((item, index) => !found.some((other, j) => j !== index
    && other.start <= item.start && other.end >= item.end && (other.end - other.start) > (item.end - item.start)));
}

function lineBounds(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return { start, end: end === -1 ? text.length : end };
}

function mergeRanges(matches, text) {
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const ranges = [];
  sorted.forEach((match) => {
    const last = ranges[ranges.length - 1];
    if (last && match.start >= last.end && CONNECTOR.test(text.slice(last.end, match.start))) {
      last.end = Math.max(last.end, match.end);
    } else if (last && match.start < last.end) {
      last.end = Math.max(last.end, match.end);
    } else {
      ranges.push({ start: match.start, end: match.end });
    }
  });
  return ranges.map((range) => ({ ...range, text: text.slice(range.start, range.end) }));
}

/** Uses the words around the scheduling phrase as the event description. */
function extractTitle(text, ranges) {
  if (!ranges.length) return '';
  const bounds = lineBounds(text, ranges[0].start);
  let line = '';
  let cursor = bounds.start;
  ranges
    .filter((range) => range.start >= bounds.start && range.end <= bounds.end)
    .forEach((range) => {
      line += `${text.slice(cursor, range.start)} `;
      cursor = range.end;
    });
  line += text.slice(cursor, bounds.end);

  let title = line.replace(/\s+/g, ' ').trim();
  title = title.replace(/[\s,;:.!?\-–—]+$/g, '').replace(/^[\s,;:.!?\-–—]+/g, '');
  title = title.replace(LEADING_FILLER, '').replace(TRAILING_FILLER, '');
  title = title.replace(/\s+(?:at|on|by)\s+(?=[,.;]|$)/gi, ' ').replace(/[\s,;:.!?\-–—]+$/g, '').trim();
  if (title.length > 60) title = `${title.slice(0, 60).replace(/\s+\S*$/, '')}…`;
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : '';
}

function pickClosest(candidates, anchor, text) {
  if (!candidates.length) return null;
  if (!anchor) return candidates[0];
  const anchorLine = lineBounds(text, anchor.start);
  const sameLine = candidates.filter((item) => item.start >= anchorLine.start && item.end <= anchorLine.end);
  const pool = sameLine.length ? sameLine : candidates;
  return pool.reduce((best, item) => {
    const distance = Math.min(Math.abs(item.start - anchor.end), Math.abs(anchor.start - item.end));
    const bestDistance = Math.min(Math.abs(best.start - anchor.end), Math.abs(anchor.start - best.end));
    return distance < bestDistance ? item : best;
  });
}

export const EMPTY_DETECTION = Object.freeze({
  found: false,
  hasDate: false,
  hasTime: false,
  date: null,
  time: null,
  title: '',
  expression: '',
  ranges: [],
  matches: [],
  confidence: 0,
});

/**
 * Detects a schedulable event in free text.
 * @returns {{found:boolean, hasDate:boolean, hasTime:boolean, date:string|null, time:string|null,
 *   title:string, expression:string, ranges:Array<{start:number,end:number,text:string}>,
 *   matches:Array, confidence:number}}
 */
export function detectReminder(text, { now = new Date() } = {}) {
  if (typeof text !== 'string' || !text.trim()) return { ...EMPTY_DETECTION };

  const dateMatches = collectMatches(text, DATE_RULES, 'date', now);
  const timeMatches = collectMatches(text, TIME_RULES, 'time', now)
    .filter((time) => !dateMatches.some((date) => time.start < date.end && time.end > date.start));
  if (!dateMatches.length && !timeMatches.length) return { ...EMPTY_DETECTION };

  const dateMatch = dateMatches[0] || null;
  const timeMatch = pickClosest(timeMatches, dateMatch, text);
  let date = dateMatch?.value.date || null;
  const time = timeMatch?.value || dateMatch?.value.impliedTime || null;

  if (!date) {
    const today = startOfDay(now);
    const [hours, minutes] = time.split(':').map(Number);
    const candidate = new Date(today);
    candidate.setHours(hours, minutes);
    date = candidate > now ? today : addDays(today, 1);
  }

  const used = [dateMatch, timeMatch].filter(Boolean);
  const ranges = mergeRanges(used, text);

  return {
    found: true,
    hasDate: Boolean(dateMatch),
    hasTime: Boolean(time),
    date: toISODate(date),
    time,
    title: extractTitle(text, ranges),
    expression: ranges.map((range) => range.text).join(' '),
    ranges,
    matches: used.map(({ kind, type, start, end, text: matched }) => ({ kind, type, start, end, text: matched })),
    confidence: dateMatch && timeMatch ? 0.9 : 0.6,
  };
}

export function hasSchedulingExpression(text) {
  return detectReminder(text).found;
}

/** Whether the confirmation workflow should open for this note. */
export function shouldTriggerReminderFlow(detection, note = null) {
  return Boolean(detection?.found) && !note?.reminder;
}
