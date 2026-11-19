import crypto from 'node:crypto';

export function hashKey(...parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u001f')).digest('hex');
}
