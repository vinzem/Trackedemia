import { describe, expect, it } from 'vitest';
import { noteCreate, noteUpdate, notesQuery, reminderCreate, extractRequest } from '../../server/validators/schemas.js';
import { validateNoteDraft, validateReminderForm } from '../../src/utils/validation.js';
import { escapeSearchTerm } from '../../server/services/notes.service.js';

const validReminder = { event_title: 'Exam', start_date: '2026-11-20', start_time: '08:00', timezone: 'Asia/Manila' };

describe('server note validation', () => {
  it('accepts valid notes and applies defaults', () => {
    expect(noteCreate.parse({})).toEqual({ title: '', content: '' });
    expect(noteCreate.parse({ title: 'A', content: 'B' })).toEqual({ title: 'A', content: 'B' });
  });
  it('rejects oversized, unknown or empty updates', () => {
    expect(noteCreate.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
    expect(noteCreate.safeParse({ content: 'x'.repeat(50001) }).success).toBe(false);
    expect(noteCreate.safeParse({ title: 'a', id: 'b' }).success).toBe(false);
    expect(noteUpdate.safeParse({}).success).toBe(false);
  });
  it('strips NUL bytes', () => {
    expect(noteCreate.parse({ title: 'a\u0000b' }).title).toBe('ab');
  });
  it('coerces and bounds list queries', () => {
    expect(notesQuery.parse({ limit: '10' }).limit).toBe(10);
    expect(notesQuery.safeParse({ limit: '1000' }).success).toBe(false);
    expect(notesQuery.safeParse({ sort: 'drop table' }).success).toBe(false);
  });
  it('escapes search terms for PostgREST filters', () => {
    expect(escapeSearchTerm('50%_off,(x)')).toBe('50\\%\\_off x');
  });
});

describe('server reminder validation', () => {
  it('accepts a complete reminder', () => {
    expect(reminderCreate.parse(validReminder)).toMatchObject({ ...validReminder, all_day: false, sync: true });
  });
  it('requires a start time unless all-day', () => {
    expect(reminderCreate.safeParse({ ...validReminder, start_time: null }).success).toBe(false);
    expect(reminderCreate.safeParse({ ...validReminder, start_time: null, all_day: true }).success).toBe(true);
  });
  it.each([
    { event_title: '' },
    { event_title: 'x'.repeat(201) },
    { start_date: '20-11-2026' },
    { start_time: '8am' },
    { timezone: 'Not/AZone' },
    { end_date: '2026-11-19' },
    { calendar_id: '' },
  ])('rejects %o', (patch) => {
    expect(reminderCreate.safeParse({ ...validReminder, ...patch }).success).toBe(false);
  });
  it('validates extraction requests', () => {
    expect(extractRequest.safeParse({ text: 'hi' }).success).toBe(true);
    expect(extractRequest.safeParse({ text: 'hi', timezone: 'Mars/Base' }).success).toBe(false);
  });
});

describe('client-side form validation', () => {
  it('validates the reminder sheet fields', () => {
    expect(validateReminderForm({ ...validReminder, calendar_id: 'primary' }).valid).toBe(true);
    const result = validateReminderForm({ event_title: ' ', start_date: '', start_time: '', timezone: 'Bad/Zone', calendar_id: '' });
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['calendar_id', 'event_title', 'start_date', 'start_time', 'timezone']);
    expect(validateReminderForm({ ...validReminder, calendar_id: 'c', end_time: '07:00' }).errors.end_time).toBeTruthy();
    expect(validateReminderForm({ ...validReminder, calendar_id: 'c', start_time: '', all_day: true }).valid).toBe(true);
  });
  it('validates note drafts', () => {
    expect(validateNoteDraft({ title: '', content: '' }).valid).toBe(false);
    expect(validateNoteDraft({ title: 'x', content: '' }).valid).toBe(true);
    expect(validateNoteDraft({ title: 'x'.repeat(201), content: 'a' }).valid).toBe(false);
  });
});
