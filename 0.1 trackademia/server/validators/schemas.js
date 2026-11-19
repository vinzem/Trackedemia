/** Request schemas shared by routes. All user input passes through these. */
import { z } from 'zod';
import { isValidTimezone } from '../utils/date-parser.js';

export const uuid = z.string().uuid('Must be a valid id.');
export const idParams = z.object({ id: uuid });

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date.');
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm.');
export const timezone = z.string().trim().min(1).max(64).refine(isValidTimezone, 'Unknown timezone.');
const text = (max) => z.string().max(max).transform((value) => value.replace(/\u0000/g, ''));

export const noteCreate = z.object({
  title: text(200).optional().default(''),
  content: text(50000).optional().default(''),
}).strict();

export const noteUpdate = z.object({
  title: text(200).optional(),
  content: text(50000).optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
}).strict().refine((value) => value.title !== undefined || value.content !== undefined, 'Nothing to update.');

export const notesQuery = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'title_asc']).default('updated_desc'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const reminderFields = {
  note_id: uuid.nullable().optional(),
  event_title: z.string().trim().min(1, 'Title is required.').max(200),
  event_description: text(5000).optional().nullable(),
  start_date: dateString,
  start_time: timeString.nullable().optional(),
  end_date: dateString.nullable().optional(),
  end_time: timeString.nullable().optional(),
  all_day: z.boolean().optional().default(false),
  timezone,
  calendar_id: z.string().trim().min(1).max(255).optional().nullable(),
  calendar_name: z.string().trim().max(255).optional().nullable(),
  source_text: z.string().max(500).optional().nullable(),
};

function checkWindow(value, ctx) {
  if (!value.all_day && !value.start_time) {
    ctx.addIssue({ code: 'custom', path: ['start_time'], message: 'Start time is required unless the event is all-day.' });
  }
  if (value.end_date && value.start_date && value.end_date < value.start_date) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date must be on or after the start date.' });
  }
  if (!value.all_day && value.start_time && value.end_time && (!value.end_date || value.end_date === value.start_date) && value.end_time <= value.start_time && value.end_date) {
    ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'End time must be after the start time.' });
  }
}

export const reminderCreate = z.object({
  ...reminderFields,
  sync: z.boolean().optional().default(true),
}).strict().superRefine(checkWindow);

export const reminderUpdate = z.object({
  event_title: reminderFields.event_title.optional(),
  event_description: reminderFields.event_description,
  start_date: dateString.optional(),
  start_time: timeString.nullable().optional(),
  end_date: dateString.nullable().optional(),
  end_time: timeString.nullable().optional(),
  all_day: z.boolean().optional(),
  timezone: timezone.optional(),
  calendar_id: reminderFields.calendar_id,
  calendar_name: reminderFields.calendar_name,
}).strict();

export const remindersQuery = z.object({
  note_id: uuid.optional(),
  status: z.enum(['pending', 'syncing', 'synced', 'failed']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const calendarEventCreate = z.object({ reminder_id: uuid }).strict();
export const calendarEventUpdate = z.object({}).strict();

export const extractRequest = z.object({
  text: z.string().min(1, 'Text is required.').max(20000),
  timezone: timezone.optional(),
  now: z.string().datetime({ offset: true }).optional(),
  note_id: uuid.optional(),
}).strict();

export const profileUpdate = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  timezone: timezone.optional(),
  default_calendar_id: z.string().trim().min(1).max(255).nullable().optional(),
  default_calendar_name: z.string().trim().max(255).nullable().optional(),
  ai_detection_enabled: z.boolean().optional(),
}).strict();

export const connectQuery = z.object({
  redirect: z.string().regex(/^\/[A-Za-z0-9/_-]{0,100}$/, 'Invalid redirect path.').optional(),
});

export const callbackQuery = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(1024).optional(),
  error: z.string().max(200).optional(),
  scope: z.string().max(2048).optional(),
}).passthrough();
