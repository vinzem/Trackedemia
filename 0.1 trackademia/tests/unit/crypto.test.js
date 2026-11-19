import { describe, expect, it } from 'vitest';
import { createCipher, parseKey } from '../../server/utils/crypto.js';
import { eventIdForReminder, toGoogleEvent } from '../../server/services/google-calendar.service.js';
import { redact } from '../../server/utils/logger.js';
import { redactPersonalData } from '../../server/services/ai-extraction.service.js';
import { DateTime } from 'luxon';

describe('token encryption', () => {
  const cipher = createCipher('ab'.repeat(32));
  it('round-trips and uses a fresh IV each time', () => {
    const a = cipher.encrypt('refresh-token');
    const b = cipher.encrypt('refresh-token');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('refresh-token');
  });
  it('detects tampering', () => {
    const value = cipher.encrypt('secret');
    const parts = value.split(':');
    parts[3] = `A${parts[3].slice(1)}`;
    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
  });
  it('signs and verifies OAuth state', () => {
    const signed = cipher.sign('nonce.user');
    expect(cipher.verify(signed)).toBe('nonce.user');
    expect(cipher.verify(`${signed}x`)).toBeNull();
    expect(cipher.verify('nonce.other.abc')).toBeNull();
  });
  it('requires a 32-byte key', () => {
    expect(() => parseKey('short')).toThrow();
    expect(parseKey(Buffer.alloc(32, 1).toString('base64')).length).toBe(32);
  });
});

describe('calendar event mapping', () => {
  it('produces valid deterministic Google event ids', () => {
    const id = eventIdForReminder('6f1c2a7e-1b2c-4d5e-8f90-a1b2c3d4e5f6');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(id).toBe(eventIdForReminder('6f1c2a7e-1b2c-4d5e-8f90-a1b2c3d4e5f6'));
  });
  it('maps timed and all-day events', () => {
    const start = DateTime.fromISO('2026-11-04T10:00', { zone: 'Asia/Manila' });
    const timed = toGoogleEvent({ title: 'T', start, end: start.plus({ hours: 1 }), timezone: 'Asia/Manila', reminderId: 'r', noteId: 'n', appUrl: 'https://app' });
    expect(timed.start).toEqual({ dateTime: '2026-11-04T10:00:00', timeZone: 'Asia/Manila' });
    expect(timed.source.url).toBe('https://app/notes/n');
    const allDay = toGoogleEvent({ title: 'T', start, end: start.plus({ days: 1 }), allDay: true, timezone: 'Asia/Manila' });
    expect(allDay.start).toEqual({ date: '2026-11-04' });
  });
});

describe('privacy helpers', () => {
  it('redacts secrets and note content from logs', () => {
    expect(redact({ access_token: 'x', nested: { content: 'diary', password: 'p' }, path: '/api' })).toEqual({ access_token: '[redacted]', nested: { content: '[redacted]', password: '[redacted]' }, path: '/api' });
  });
  it('redacts personal data before AI processing but keeps times', () => {
    expect(redactPersonalData('Email a@b.co, call +1 (555) 123-4567 at 10:30, see https://x.y/z')).toBe('Email [email], call [phone] at 10:30, see [link]');
  });
});
