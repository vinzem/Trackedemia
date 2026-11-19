/**
 * Deterministic, timezone-aware scheduling-phrase parser.
 *
 * Shared by the server (fallback when the AI service is unavailable, and as a
 * cross-check of AI output) and the browser (instant offline highlighting).
 * It never invents a date or a time: anything it cannot read from the text is
 * reported in `missing_fields`, with an optional human `clarification`.
 */
import { DateTime } from 'luxon';

export const DEFAULT_TIMEZONE = 'UTC';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY_RE = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';
const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5,
};
const NUM_RE = `\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')}`;
const PART_OF_DAY = {
  morning: 'morning', afternoon: 'afternoon', evening: 'evening', tonight: 'evening', night: 'evening', lunch: 'midday',
};
/** Quick pre-filter: does this text plausibly contain a scheduling phrase? */
export const TEMPORAL_CUE = new RegExp(
  `\\b(?:today|tonight|tomorrow|yesterday|${WEEKDAY_RE}|${MONTH_RE}|noon|midnight|morning|afternoon|evening|`
  + 'next|in\\s+(?:\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\\s|the\\s+\\d{1,2}(?:st|nd|rd|th))\\b'
  + '|\\b\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)|\\b\\d{1,2}[/-]\\d{1,2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}:\\d{2}\\b',
  'i',
);

function toNumber(token) {
  const key = String(token).toLowerCase();
  return key in NUMBER_WORDS ? NUMBER_WORDS[key] : Number(key);
}

function monthIndex(token) {
  return MONTHS.indexOf(token.toLowerCase().slice(0, 3));
}

function weekdayIndex(token) {
  const key = token.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex((day) => day.startsWith(key)) + 1; // luxon: 1 = Monday
}

function to24h(hourToken, minuteToken, meridiem) {
  let hour = Number(hourToken);
  const minute = Number(minuteToken || 0);
  if (Number.isNaN(hour) || hour > 23 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase().startsWith('p');
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Resolves a month/day that has no explicit year. Dates that passed within the
 * last 30 days are treated as past references; older ones roll to next year.
 */
function resolveMonthDay(now, month, day, year) {
  const base = { month: month + 1, day };
  let date = DateTime.fromObject({ ...base, year: year ?? now.year }, { zone: now.zone });
  if (!date.isValid) return null;
  if (year == null && date < now.startOf('day') && now.startOf('day').diff(date, 'days').days > 30) {
    date = date.plus({ years: 1 });
  }
  return date.startOf('day');
}

// ---------------------------------------------------------------------------
// Rules. Each returns { date?: DateTime, time?: 'HH:mm', datetime?: DateTime,
// hint?: string, past?: boolean, ambiguous?: string } for a match.
// ---------------------------------------------------------------------------

const DATE_RULES = [
  {
    name: 'relative-datetime',
    re: new RegExp(`\\bin\\s+(${NUM_RE})\\s+(minutes?|mins?|hours?|hrs?)\\b`, 'gi'),
    resolve: (m, now) => {
      const amount = toNumber(m[1]);
      if (!amount) return null;
      const minutes = m[2].toLowerCase().startsWith('h') ? amount * 60 : amount;
      return { datetime: now.plus({ minutes }).set({ second: 0, millisecond: 0 }) };
    },
  },
  {
    name: 'relative-word',
    re: /\b(day after tomorrow|tomorrow|today|tonight|yesterday)\b/gi,
    resolve: (m, now) => {
      const word = m[1].toLowerCase();
      const offset = { tomorrow: 1, 'day after tomorrow': 2, yesterday: -1 }[word] ?? 0;
      return {
        date: now.startOf('day').plus({ days: offset }),
        hint: word === 'tonight' ? 'evening' : undefined,
        past: word === 'yesterday',
      };
    },
  },
  {
    name: 'in-days',
    re: new RegExp(`\\bin\\s+(${NUM_RE})\\s+(days?|weeks?)\\b`, 'gi'),
    resolve: (m, now) => {
      const amount = toNumber(m[1]);
      if (!amount) return null;
      const days = m[2].toLowerCase().startsWith('w') ? amount * 7 : amount;
      return { date: now.startOf('day').plus({ days: Math.round(days) }) };
    },
  },
  {
    name: 'weekday',
    re: new RegExp(`\\b(?:(next|this|on|last|coming)\\s+)?(${WEEKDAY_RE})\\b`, 'gi'),
    resolve: (m, now) => {
      const target = weekdayIndex(m[2]);
      if (target < 1) return null;
      const modifier = (m[1] || '').toLowerCase();
      const today = now.startOf('day');
      if (modifier === 'last') {
        let back = (today.weekday - target + 7) % 7;
        if (back === 0) back = 7;
        return { date: today.minus({ days: back }), past: true };
      }
      let ahead = (target - today.weekday + 7) % 7;
      if (ahead === 0 && modifier === 'next') ahead = 7;
      return { date: today.plus({ days: ahead }) };
    },
  },
  {
    name: 'iso-date',
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    resolve: (m, now) => {
      const date = DateTime.fromObject({ year: +m[1], month: +m[2], day: +m[3] }, { zone: now.zone });
      return date.isValid ? { date } : null;
    },
  },
  {
    name: 'month-day',
    re: new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi'),
    resolve: (m, now) => {
      const date = resolveMonthDay(now, monthIndex(m[1]), +m[2], m[3] ? +m[3] : null);
      return date ? { date } : null;
    },
  },
  {
    name: 'day-month',
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b(?:,?\\s+(\\d{4}))?`, 'gi'),
    resolve: (m, now) => {
      const date = resolveMonthDay(now, monthIndex(m[2]), +m[1], m[3] ? +m[3] : null);
      return date ? { date } : null;
    },
  },
  {
    name: 'numeric-date',
    re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g,
    resolve: (m, now) => {
      let year = m[3] ? +m[3] : null;
      if (year !== null && year < 100) year += 2000;
      const date = resolveMonthDay(now, +m[1] - 1, +m[2], year);
      return date ? { date } : null;
    },
  },
  {
    name: 'ordinal-day',
    re: /\b(?:on\s+)?the\s+(\d{1,2})(st|nd|rd|th)\b(?!\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/gi,
    resolve: (m, now) => {
      const day = +m[1];
      if (day < 1 || day > 31) return null;
      const today = now.startOf('day');
      for (let i = 0; i < 13; i += 1) {
        const month = today.plus({ months: i });
        if (day > month.daysInMonth) continue;
        const candidate = month.set({ day });
        if (candidate >= today) return { date: candidate };
      }
      return null;
    },
  },
];

const TIME_RULES = [
  {
    name: 'time-range',
    re: /\b(?:from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/gi,
    resolve: (m) => {
      const endMeridiem = m[6];
      let startMeridiem = m[3];
      if (!startMeridiem) {
        // "2-4pm" shares the meridiem; "11-1pm" crosses noon.
        startMeridiem = Number(m[1]) > Number(m[4]) && Number(m[1]) !== 12 ? 'am' : endMeridiem;
      }
      const time = to24h(m[1], m[2], startMeridiem);
      const endTime = to24h(m[4], m[5], endMeridiem);
      return time && endTime ? { time, endTime } : null;
    },
  },
  {
    name: 'clock-12h',
    re: /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/gi,
    resolve: (m) => {
      const time = to24h(m[1], m[2], m[3]);
      return time ? { time } : null;
    },
  },
  {
    name: 'clock-24h',
    re: /\b(?:at\s+|@\s*)?([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm|a\.m|p\.m))/gi,
    resolve: (m) => ({ time: to24h(m[1], m[2]) }),
  },
  {
    name: 'named-time',
    re: /\b(noon|midday|midnight)\b/gi,
    resolve: (m) => ({ time: m[1].toLowerCase() === 'midnight' ? '00:00' : '12:00' }),
  },
  {
    name: 'bare-hour',
    re: /\b(?:at|@|around)\s+(\d{1,2})\b(?!\s*(?::|\/|am|pm|a\.m|p\.m|st|nd|rd|th|%|\d))/gi,
    resolve: (m) => {
      const hour = Number(m[1]);
      if (hour < 1 || hour > 12) return hour >= 13 && hour <= 23 ? { time: to24h(hour, 0) } : null;
      return { ambiguous: `Did you mean ${hour} AM or ${hour} PM?`, hint: `${hour} o'clock` };
    },
  },
  {
    name: 'part-of-day',
    re: /\b(?:in the\s+|this\s+)?(morning|afternoon|evening|night|lunch)\b/gi,
    resolve: (m) => ({ hint: PART_OF_DAY[m[1].toLowerCase()] }),
  },
];

const DURATION_RULE = new RegExp(`\\bfor\\s+(${NUM_RE}|an?)\\s+(minutes?|mins?|hours?|hrs?)\\b`, 'gi');

const CONNECTOR = /^[\s,]*(?:at|@|by|on|from|around|in the|this|,)?[\s,]*$/i;
const LEADING_FILLER = /^(?:(?:remind me to|remind me|remember to|don't forget to|dont forget to|reminder:?|todo:?|note:?|i need to|need to|i have to|have to|i have an?|i have|we have an?|we have)\s+)+/i;
const TRAILING_FILLER = /(?:\s+(?:at|on|by|due|this|next|from|around|for|is|in|the|until|@))+\s*$/i;

function collect(text, rules) {
  const found = [];
  rules.forEach((rule) => {
    for (const match of text.matchAll(rule.re)) {
      found.push({ rule: rule.name, start: match.index, end: match.index + match[0].length, match });
    }
  });
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  found.forEach((item) => {
    if (!kept.some((other) => item.start < other.end && item.end > other.start)) kept.push(item);
  });
  return kept;
}

/** Splits text into sentence-like segments while preserving offsets. */
export function segmentText(text) {
  const segments = [];
  const boundary = /(?<=[.!?;])\s+/g;
  let lineStart = 0;
  text.split('\n').forEach((line) => {
    let cursor = 0;
    const push = (from, to) => {
      const part = line.slice(from, to);
      if (part.trim()) segments.push({ start: lineStart + from, end: lineStart + to, text: part });
    };
    for (const match of line.matchAll(boundary)) {
      push(cursor, match.index);
      cursor = match.index + match[0].length;
    }
    push(cursor, line.length);
    lineStart += line.length + 1;
  });
  return segments;
}

function cleanTitle(segmentText, removals) {
  let title = '';
  let cursor = 0;
  [...removals].sort((a, b) => a.start - b.start).forEach((range) => {
    title += `${segmentText.slice(cursor, range.start)} `;
    cursor = range.end;
  });
  title += segmentText.slice(cursor);
  title = title.replace(/\s+/g, ' ').trim();
  const strip = (value) => value.replace(/^[\s,;:.!?\-–—•*]+|[\s,;:.!?\-–—]+$/g, '');
  title = strip(title).replace(LEADING_FILLER, '');
  for (let i = 0; i < 3; i += 1) title = strip(title.replace(TRAILING_FILLER, ''));
  title = title.replace(/\s+(?:at|on|by|for|in)\s+(?=[,.;]|$)/gi, ' ').trim();
  title = title.replace(/\s+(?:at|on|by|for|in)\s+(?:at|on|by|for|in)\s+/gi, ' ');
  if (title.length > 80) title = `${title.slice(0, 80).replace(/\s+\S*$/, '')}…`;
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : '';
}

function mergeRanges(items, text) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const ranges = [];
  sorted.forEach((item) => {
    const last = ranges[ranges.length - 1];
    if (last && (item.start <= last.end || CONNECTOR.test(text.slice(last.end, item.start)))) {
      last.end = Math.max(last.end, item.end);
    } else {
      ranges.push({ start: item.start, end: item.end });
    }
  });
  return ranges;
}

function resolveNow(now, timezone) {
  const zone = timezone || DEFAULT_TIMEZONE;
  if (DateTime.isDateTime(now)) return now.setZone(zone);
  if (now instanceof Date) return DateTime.fromJSDate(now).setZone(zone);
  if (typeof now === 'string') return DateTime.fromISO(now, { setZone: true }).setZone(zone);
  return DateTime.now().setZone(zone);
}

export function isValidTimezone(timezone) {
  return typeof timezone === 'string' && timezone.length > 0 && DateTime.local().setZone(timezone).isValid;
}

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

function parseSegment(segment, now, timezone) {
  const { text } = segment;
  const dates = collect(text, DATE_RULES)
    .map((item) => ({ ...item, value: DATE_RULES.find((r) => r.name === item.rule).resolve(item.match, now) }))
    .filter((item) => item.value);
  const times = collect(text, TIME_RULES)
    .filter((item) => !dates.some((d) => item.start < d.end && item.end > d.start))
    .map((item) => ({ ...item, value: TIME_RULES.find((r) => r.name === item.rule).resolve(item.match, now) }))
    .filter((item) => item.value);
  if (!dates.length && !times.some((t) => t.value.time || t.value.ambiguous)) return null;

  const dateItem = dates[0] || null;
  const exactTimes = times.filter((t) => t.value.time);
  const nearest = (pool) => (!dateItem || pool.length < 2 ? pool[0] : pool.reduce((best, item) => (
    Math.abs(item.start - dateItem.end) < Math.abs(best.start - dateItem.end) ? item : best
  )));
  const timeItem = nearest(exactTimes) || null;
  const hintItem = timeItem ? null : nearest(times.filter((t) => !t.value.time)) || null;

  let startDate = null;
  let startTime = null;
  let endTime = timeItem?.value.endTime || null;
  let past = Boolean(dateItem?.value.past);
  let hint = hintItem?.value.hint || dateItem?.value.hint || null;
  const clarifications = [];
  if (hintItem?.value.ambiguous) clarifications.push(hintItem.value.ambiguous);

  if (dateItem?.value.datetime) {
    startDate = dateItem.value.datetime.toISODate();
    startTime = dateItem.value.datetime.toFormat('HH:mm');
    hint = null;
  } else if (dateItem?.value.date) {
    startDate = dateItem.value.date.toISODate();
  }
  if (timeItem && !dateItem?.value.datetime) startTime = timeItem.value.time;

  let durationMinutes = null;
  const durationMatch = [...text.matchAll(DURATION_RULE)][0];
  if (durationMatch) durationMinutes = Math.round(toNumber(durationMatch[1]) * (durationMatch[2].toLowerCase().startsWith('h') ? 60 : 1));

  const missing = [];
  if (!startDate) {
    missing.push('start_date');
    clarifications.push('Which day is this for?');
  }
  if (!startTime) {
    missing.push('start_time');
    if (hint && !hintItem?.value.ambiguous) clarifications.push(`What time in the ${hint}?`);
  }

  let startDateTime = null;
  let endDateTime = null;
  let endDate = null;
  if (startDate && startTime) {
    const start = DateTime.fromISO(`${startDate}T${startTime}`, { zone: timezone });
    startDateTime = start.toFormat(LOCAL_FORMAT);
    if (start < now) past = true;
    let end = null;
    if (endTime) {
      end = DateTime.fromISO(`${startDate}T${endTime}`, { zone: timezone });
      if (end <= start) end = end.plus({ days: 1 });
      durationMinutes = Math.round(end.diff(start, 'minutes').minutes);
    } else if (durationMinutes) {
      end = start.plus({ minutes: durationMinutes });
      endTime = end.toFormat('HH:mm');
    }
    if (end) {
      endDateTime = end.toFormat(LOCAL_FORMAT);
      endDate = end.toISODate();
    }
  } else if (startDate && DateTime.fromISO(startDate, { zone: timezone }) < now.startOf('day')) {
    past = true;
  }

  const used = [dateItem, timeItem || hintItem].filter(Boolean);
  const ranges = mergeRanges(used, text).map((r) => ({ start: segment.start + r.start, end: segment.start + r.end }));
  const removals = [...used, ...(durationMatch ? [{ start: durationMatch.index, end: durationMatch.index + durationMatch[0].length }] : [])];
  if (timeItem?.value.endTime) removals.push({ start: timeItem.start, end: timeItem.end });

  let confidence = 0.35;
  if (startDate && startTime) confidence = 0.9;
  else if (startDate) confidence = 0.7;
  else if (startTime) confidence = 0.5;
  if (clarifications.length && startDate && startTime) confidence -= 0.1;
  if (hintItem?.value.ambiguous) confidence -= 0.15;

  return {
    detected: true,
    event_title: cleanTitle(text, removals),
    event_description: text.trim(),
    start_date: startDate,
    start_time: startTime,
    end_date: endDate,
    end_time: endTime,
    start_datetime: startDateTime,
    end_datetime: endDateTime,
    duration_minutes: durationMinutes,
    timezone,
    confidence: Math.max(0.1, Math.round(confidence * 100) / 100),
    missing_fields: missing,
    clarification: clarifications.length ? clarifications.join(' ') : null,
    time_hint: startTime ? null : hint,
    is_past: past,
    source_text: ranges.map((r) => segment.text.slice(r.start - segment.start, r.end - segment.start)).join(' … '),
    range: ranges[0] || null,
    ranges,
  };
}

/**
 * Finds every schedulable event in `text`.
 * @param {string} text
 * @param {{ now?: Date|string|DateTime, timezone?: string }} [options]
 * @returns {{ detected: boolean, events: object[], timezone: string, reference_time: string }}
 */
export function parseSchedulingText(text, { now, timezone } = {}) {
  const zone = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const reference = resolveNow(now, zone);
  const events = [];
  if (typeof text === 'string' && text.trim()) {
    segmentText(text).forEach((segment) => {
      const event = parseSegment(segment, reference, zone);
      if (event) events.push(event);
    });
  }
  return { detected: events.length > 0, events, timezone: zone, reference_time: reference.toISO(), engine: 'rules' };
}

/** Combines a local date + time in a timezone into an absolute ISO instant. */
export function zonedToUtcISO(date, time, timezone) {
  const value = DateTime.fromISO(`${date}T${time || '00:00'}`, { zone: timezone });
  return value.isValid ? value.toUTC().toISO() : null;
}

const TIME_CUE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\b\d{1,2}:\d{2}\b|\b(?:noon|midday|midnight)\b|\bin\s+\S+\s+(?:minutes?|mins?|hours?|hrs?)\b/i;
const DATE_CUE = new RegExp(
  `\\b(?:today|tonight|tomorrow|yesterday|${WEEKDAY_RE}|${MONTH_RE})\\b|\\bin\\s+\\S+\\s+(?:days?|weeks?|minutes?|mins?|hours?|hrs?)\\b`
  + '|\\bthe\\s+\\d{1,2}(?:st|nd|rd|th)\\b|\\b\\d{1,2}\\/\\d{1,2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b',
  'i',
);

/** True when the text literally contains a clock time (used to reject invented times). */
export function hasTimeCue(text) {
  return TIME_CUE.test(text || '');
}

/** True when the text literally contains a calendar reference (used to reject invented dates). */
export function hasDateCue(text) {
  return DATE_CUE.test(text || '');
}

/** Locates `needle` in `haystack` (case-insensitive, whitespace-tolerant). */
export function findTextRange(haystack, needle, fromIndex = 0) {
  if (!needle || !haystack) return null;
  const escaped = needle.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  if (!escaped) return null;
  const re = new RegExp(escaped, 'gi');
  re.lastIndex = fromIndex;
  const match = re.exec(haystack) || (fromIndex > 0 ? new RegExp(escaped, 'i').exec(haystack) : null);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * Normalises a partially-specified event (e.g. from the AI service) into the
 * same shape `parseSchedulingText` returns, recomputing derived fields.
 */
export function finalizeEvent(fields, { timezone, now } = {}) {
  const zone = isValidTimezone(fields.timezone) ? fields.timezone : (isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE);
  const reference = resolveNow(now, zone);
  const startDate = fields.start_date || null;
  const startTime = fields.start_time || null;
  let endTime = fields.end_time || null;
  let endDate = fields.end_date || null;
  let duration = Number.isInteger(fields.duration_minutes) && fields.duration_minutes > 0 ? fields.duration_minutes : null;
  let startDateTime = null;
  let endDateTime = null;
  let past = false;

  if (startDate && startTime) {
    const start = DateTime.fromISO(`${startDate}T${startTime}`, { zone });
    if (start.isValid) {
      startDateTime = start.toFormat(LOCAL_FORMAT);
      past = start < reference;
      let end = null;
      if (endTime) {
        end = DateTime.fromISO(`${endDate || startDate}T${endTime}`, { zone });
        if (end.isValid && end <= start) end = end.plus({ days: 1 });
        if (end.isValid) duration = Math.round(end.diff(start, 'minutes').minutes);
      } else if (duration) {
        end = start.plus({ minutes: duration });
        endTime = end.toFormat('HH:mm');
      }
      if (end?.isValid) {
        endDateTime = end.toFormat(LOCAL_FORMAT);
        endDate = end.toISODate();
      }
    }
  } else if (startDate) {
    past = DateTime.fromISO(startDate, { zone }) < reference.startOf('day');
  }

  const missing = [];
  if (!startDate) missing.push('start_date');
  if (!startTime) missing.push('start_time');

  return {
    detected: true,
    event_title: String(fields.event_title || '').trim().slice(0, 200),
    event_description: fields.event_description ? String(fields.event_description).trim().slice(0, 5000) : '',
    start_date: startDate,
    start_time: startTime,
    end_date: endDate,
    end_time: endTime,
    start_datetime: startDateTime,
    end_datetime: endDateTime,
    duration_minutes: duration,
    timezone: zone,
    confidence: Math.min(1, Math.max(0, Number(fields.confidence) || 0)),
    missing_fields: missing,
    clarification: fields.clarification || (missing.length ? (missing.includes('start_date') ? 'Which day is this for?' : 'What time should this start?') : null),
    time_hint: fields.time_hint || null,
    is_past: past,
    source_text: fields.source_text || '',
    range: fields.range || null,
    ranges: fields.range ? [fields.range] : [],
  };
}
