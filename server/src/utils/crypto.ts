import crypto from 'crypto';
import { env } from '../config/env';
const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
export const encrypt = (t: string) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.'); };
export const decrypt = (p: string) => { const [iv, tag, enc] = p.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); };
