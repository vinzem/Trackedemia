import { Router } from 'express';
import { z } from 'zod';
import * as chrono from 'chrono-node';
import { AuthReq } from '../middleware/auth';
const r = Router(); const p2 = (n: number) => String(n).padStart(2, '0');
const offsetMin = (tz: string) => { try { const d = new Date(); const f = (z: string) => new Date(d.toLocaleString('en-US', { timeZone: z })).getTime(); return Math.round((f(tz) - f('UTC')) / 60000); } catch { return 0; } };
r.post('/detect', (q: AuthReq, res, n) => { try {
  const { content, timeZone } = z.object({ content: z.string().max(200000), timeZone: z.string().default('UTC') }).parse(q.body);
  const hit = chrono.parse(content, { instant: new Date(), timezone: offsetMin(timeZone) }, { forwardDate: true })[0];
  if (!hit) return res.json({ detected: null });
  const s = hit.start, hasTime = s.isCertain('hour');
  const title = (content.slice(0, hit.index).replace(/\b(on|at|by|due|is)\s*$/i, '').trim() || content.slice(hit.index + hit.text.length).trim() || 'Reminder').slice(0, 120);
  res.json({ detected: { title, date: `${s.get('year')}-${p2(s.get('month')!)}-${p2(s.get('day')!)}`, time: hasTime ? `${p2(s.get('hour')!)}:${p2(s.get('minute') ?? 0)}` : '09:00', confidence: hasTime && s.isCertain('day') ? 'high' : s.isCertain('day') ? 'medium' : 'low', matchedText: hit.text, timeAssumed: !hasTime } });
} catch (e) { n(e); } });
export default r;
