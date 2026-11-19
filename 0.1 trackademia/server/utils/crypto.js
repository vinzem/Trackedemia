/** AES-256-GCM encryption for OAuth tokens at rest, plus HMAC signing for OAuth state. */
import crypto from 'node:crypto';

const VERSION = 'v1';

export function parseKey(raw) {
  if (!raw) throw new Error('ENCRYPTION_KEY is required');
  const trimmed = raw.trim();
  let key;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) key = Buffer.from(trimmed, 'hex');
  else key = Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).');
  return key;
}

export function createCipher(rawKey) {
  const key = parseKey(rawKey);
  const signingKey = crypto.createHmac('sha256', key).update('trackademia-oauth-state').digest();

  return {
    encrypt(plaintext) {
      if (plaintext == null) return null;
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
    },
    decrypt(payload) {
      if (payload == null) return null;
      const [version, iv, tag, data] = String(payload).split(':');
      if (version !== VERSION || !iv || !tag || data == null) throw new Error('Unrecognised ciphertext format');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    },
    sign(value) {
      const mac = crypto.createHmac('sha256', signingKey).update(value).digest('base64url');
      return `${value}.${mac}`;
    },
    verify(signed) {
      const index = String(signed || '').lastIndexOf('.');
      if (index <= 0) return null;
      const value = signed.slice(0, index);
      const expected = Buffer.from(this.sign(value).slice(index + 1));
      const actual = Buffer.from(signed.slice(index + 1));
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
      return value;
    },
  };
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashKey(...parts) {
  return crypto.createHash('sha256').update(parts.map((p) => String(p ?? '')).join('\u001f')).digest('hex').slice(0, 64);
}
