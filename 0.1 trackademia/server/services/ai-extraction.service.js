/**
 * AI-assisted event extraction with OpenAI structured outputs.
 *
 * Privacy: only sentences that contain a temporal cue are sent, with emails,
 * phone numbers and URLs redacted. The deterministic parser is used when AI is
 * disabled, unavailable, or returns invalid data. AI output is validated and
 * cross-checked so the model can never invent a date or time.
 */
import { DateTime } from 'luxon';
import { z } from 'zod';
import {
  TEMPORAL_CUE, finalizeEvent, findTextRange, hasDateCue, hasTimeCue, parseSchedulingText, segmentText,
} from '../utils/date-parser.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_SEGMENTS = 25;
const MAX_SEGMENT_LENGTH = 400;

const nullableString = { type: ['string', 'null'] };
export const EXTRACTION_JSON_SCHEMA = {
  name: 'trackademia_events',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['event_title', 'event_description', 'start_date', 'start_time', 'end_date', 'end_time',
            'duration_minutes', 'timezone', 'confidence', 'source_text', 'missing_fields', 'clarification', 'is_past'],
          properties: {
            event_title: { type: 'string', description: 'Short imperative title, max 80 chars, no date words.' },
            event_description: nullableString,
            start_date: { ...nullableString, description: 'YYYY-MM-DD, or null if the text has no day.' },
            start_time: { ...nullableString, description: '24h HH:mm, or null if the text has no clock time.' },
            end_date: nullableString,
            end_time: nullableString,
            duration_minutes: { type: ['integer', 'null'] },
            timezone: { type: 'string' },
            confidence: { type: 'number' },
            source_text: { type: 'string', description: 'The exact scheduling phrase copied verbatim from the input.' },
            missing_fields: { type: 'array', items: { type: 'string', enum: ['start_date', 'start_time', 'end_time'] } },
            clarification: nullableString,
            is_past: { type: 'boolean' },
          },
        },
      },
    },
  },
};

const aiEventSchema = z.object({
  event_title: z.string().trim().min(1).max(200),
  event_description: z.string().max(5000).nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  duration_minutes: z.number().int().positive().max(60 * 24 * 14).nullable(),
  timezone: z.string().max(64),
  confidence: z.number().min(0).max(1),
  source_text: z.string().min(1).max(500),
  missing_fields: z.array(z.string()),
  clarification: z.string().max(300).nullable(),
  is_past: z.boolean(),
});
const aiResponseSchema = z.object({ events: z.array(z.unknown()).max(50) });

export function redactPersonalData(text) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (match) => (/\d{1,2}:\d{2}/.test(match) ? match : '[phone]'));
}

/** Picks only the sentences that could contain a schedule, to minimise data sent. */
export function selectCandidateSegments(text) {
  return segmentText(text)
    .filter((segment) => TEMPORAL_CUE.test(segment.text))
    .slice(0, MAX_SEGMENTS)
    .map((segment) => ({ ...segment, redacted: redactPersonalData(segment.text.slice(0, MAX_SEGMENT_LENGTH)) }));
}

function systemPrompt(timezone, nowLocal) {
  return [
    'You extract calendar events from short personal notes.',
    `The user's timezone is ${timezone}. The current local date-time is ${nowLocal} (weekday included).`,
    'Rules:',
    '- Resolve relative expressions (tomorrow, next Monday, in two hours, the 15th) against the current local date-time.',
    '- NEVER invent a date or time. If the text has no day, start_date is null. If it has no explicit clock time, start_time is null.',
    '- Vague parts of day (afternoon, evening, morning) are NOT times: set start_time null and ask in clarification.',
    '- An hour without am/pm that could be either (e.g. "at 6") is ambiguous: start_time null and ask in clarification.',
    '- Only include end_time / duration when the text states them.',
    '- source_text must be copied exactly, character for character, from the input.',
    '- is_past is true when the event is before the current date-time (e.g. "yesterday").',
    '- Each sentence may contain zero or more events; return an empty list when nothing is schedulable.',
    '- event_title should be concise and must not contain the date/time words.',
  ].join('\n');
}

function overlaps(a, b) {
  return a && b && a.start < b.end && b.start < a.end;
}

export function createAiExtractionService({ config, fetchImpl = globalThis.fetch, logger }) {
  const aiEnabled = Boolean(config.openai?.apiKey);

  async function callOpenAI(lines, timezone, now) {
    const nowLocal = now.toFormat("cccc, yyyy-MM-dd'T'HH:mm");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.openai.timeoutMs || 15000);
    try {
      const response = await fetchImpl(OPENAI_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.openai.model,
          temperature: 0,
          store: false,
          response_format: { type: 'json_schema', json_schema: EXTRACTION_JSON_SCHEMA },
          messages: [
            { role: 'system', content: systemPrompt(timezone, nowLocal) },
            { role: 'user', content: lines.map((line, index) => `${index + 1}. ${line}`).join('\n') },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI responded ${response.status}`);
      const payload = await response.json();
      const message = payload?.choices?.[0]?.message;
      if (message?.refusal) throw new Error('OpenAI refused the request');
      return aiResponseSchema.parse(JSON.parse(message?.content || '{}'));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Validates one AI event against the original text; returns null if unusable. */
  function validateAiEvent(raw, { text, segments, timezone, now, usedRanges }) {
    const parsed = aiEventSchema.safeParse(raw);
    if (!parsed.success) return null;
    const event = parsed.data;
    const range = findTextRange(text, event.source_text);
    if (!range || usedRanges.some((r) => overlaps(r, range))) return null;
    const segment = segments.find((s) => range.start >= s.start && range.start < s.end);
    const context = segment ? segment.text : event.source_text;

    // Guardrails against invented values: the text must literally contain them.
    const startTime = event.start_time && hasTimeCue(context) ? event.start_time : null;
    const startDate = event.start_date && (hasDateCue(context) || startTime) ? event.start_date : null;
    const endTime = event.end_time && startTime ? event.end_time : null;
    const invented = (event.start_time && !startTime) || (event.start_date && !startDate);

    const finalized = finalizeEvent({
      ...event,
      start_date: startDate,
      start_time: startTime,
      end_time: endTime,
      end_date: endTime ? event.end_date : null,
      duration_minutes: startTime ? event.duration_minutes : null,
      timezone,
      confidence: invented ? Math.min(event.confidence, 0.5) : event.confidence,
      event_description: event.event_description || context.trim(),
      range,
    }, { timezone, now });
    if (!finalized.event_title) return null;
    return finalized;
  }

  return {
    isAiEnabled: () => aiEnabled,

    /**
     * @param {{ text:string, timezone:string, now?:string, allowAi?:boolean }} input
     * @returns {Promise<{ detected:boolean, engine:'openai'|'rules'|'hybrid', events:object[], timezone:string, reference_time:string, ai_used:boolean, fallback_reason?:string }>}
     */
    async extract({ text, timezone, now, allowAi = true }) {
      const rules = parseSchedulingText(text, { timezone, now });
      const base = { timezone: rules.timezone, reference_time: rules.reference_time };
      if (!aiEnabled || !allowAi) {
        return { ...base, detected: rules.detected, events: rules.events, engine: 'rules', ai_used: false, fallback_reason: aiEnabled ? 'ai_disabled_by_user' : 'ai_not_configured' };
      }
      const segments = selectCandidateSegments(text);
      if (!segments.length) return { ...base, detected: false, events: [], engine: 'rules', ai_used: false };

      const reference = DateTime.fromISO(rules.reference_time, { setZone: true });
      let aiEvents;
      try {
        const response = await callOpenAI(segments.map((segment) => segment.redacted), rules.timezone, reference);
        const usedRanges = [];
        aiEvents = [];
        response.events.forEach((raw) => {
          const event = validateAiEvent(raw, { text, segments, timezone: rules.timezone, now: reference, usedRanges });
          if (event) {
            aiEvents.push({ ...event, engine: 'openai' });
            usedRanges.push(event.range);
          }
        });
      } catch (error) {
        logger?.warn('ai_extraction_fallback', { reason: error.name === 'AbortError' ? 'timeout' : error.message });
        return { ...base, detected: rules.detected, events: rules.events, engine: 'rules', ai_used: false, fallback_reason: 'ai_unavailable' };
      }

      // Keep deterministic detections the model skipped (higher recall), but
      // never past-dated ones the model deliberately left out.
      const extra = rules.events.filter((ruleEvent) => !ruleEvent.is_past
        && !aiEvents.some((aiEvent) => ruleEvent.ranges.some((r) => overlaps(r, aiEvent.range))));
      const events = [...aiEvents, ...extra.map((event) => ({ ...event, engine: 'rules' }))]
        .sort((a, b) => (a.range?.start ?? 0) - (b.range?.start ?? 0));
      return { ...base, detected: events.length > 0, events, engine: extra.length && aiEvents.length ? 'hybrid' : 'openai', ai_used: true };
    },
  };
}
