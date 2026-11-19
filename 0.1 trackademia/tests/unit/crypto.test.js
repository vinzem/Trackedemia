import { describe, expect, it } from 'vitest';
import { hashKey } from '../../server/utils/crypto.js';
import { redact } from '../../server/utils/logger.js';
import { redactPersonalData } from '../../server/services/ai-extraction.service.js';

describe('calendar idempotency hash', () => {
  it('is deterministic and separates distinct event keys', () => {
    expect(hashKey('note', 'exam', '2026-11-20')).toBe(hashKey('note', 'exam', '2026-11-20'));
    expect(hashKey('note', 'exam', '2026-11-20')).not.toBe(hashKey('note', 'exam', '2026-11-21'));
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
