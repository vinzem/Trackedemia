import { google } from 'googleapis';
import { env } from '../config/env';
import { prisma } from '../utils/db';
import { encrypt, decrypt } from '../utils/crypto';
export const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'];
export const oauth = () => new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);
export const authUrl = () => oauth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, include_granted_scopes: true });
export class CalendarError extends Error { constructor(public status: number, m: string) { super(m); } }

export async function calendarFor(userId: string) {
  const acc = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acc || !acc.calendarConnected) throw new CalendarError(409, 'Google Calendar is not connected');
  const c = oauth();
  c.setCredentials({ access_token: decrypt(acc.accessToken), refresh_token: acc.refreshToken ? decrypt(acc.refreshToken) : undefined, expiry_date: acc.tokenExpiry?.getTime() });
  c.on('tokens', async t => { // googleapis refreshes automatically; persist the new tokens encrypted
    await prisma.googleAccount.update({ where: { userId }, data: { ...(t.access_token && { accessToken: encrypt(t.access_token) }), ...(t.expiry_date && { tokenExpiry: new Date(t.expiry_date) }), ...(t.refresh_token && { refreshToken: encrypt(t.refresh_token) }) } });
  });
  return google.calendar({ version: 'v3', auth: c });
}
export const wrap = async <T,>(userId: string, fn: (cal: any) => Promise<T>): Promise<T> => {
  const cal = await calendarFor(userId);
  try { return await fn(cal); } catch (e: any) {
    const code = e?.code || e?.response?.status;
    if (code === 401 || String(e?.message).includes('invalid_grant')) { await prisma.googleAccount.update({ where: { userId }, data: { calendarConnected: false } }); throw new CalendarError(401, 'Google access expired. Reconnect Google Calendar in Settings.'); }
    if (code === 404 || code === 410) throw new CalendarError(404, 'Event not found in Google Calendar');
    throw new CalendarError(502, 'Google Calendar request failed');
  }
};
export const eventBody = (r: { title: string; date: string; time: string; timeZone: string }) => {
  const start = `${r.date}T${r.time}:00`;
  const end = new Date(new Date(`${start}Z`).getTime() + 3600_000).toISOString().slice(0, 19);
  return { summary: r.title, start: { dateTime: start, timeZone: r.timeZone }, end: { dateTime: end, timeZone: r.timeZone } };
};
