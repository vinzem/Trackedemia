import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { env } from '../config/env';
import { prisma } from '../utils/db';
import { encrypt } from '../utils/crypto';
import { oauth, authUrl } from '../services/google';
import { requireAuth, AuthReq } from '../middleware/auth';
const DEFAULT_CATS = [['DSA', '#B00020'], ['Research', '#2E7D32'], ['Group Project', '#6A1B9A'], ['Personal', '#7B8BA5']];
const cookieOpts = { httpOnly: true, secure: env.prod, sameSite: 'lax' as const, maxAge: 7 * 864e5, path: '/' };
const r = Router();
r.get('/google', (_q, res) => res.redirect(authUrl()));
r.get('/google/callback', async (req, res) => {
  try {
    if (req.query.error || !req.query.code) throw new Error(String(req.query.error || 'no code'));
    const c = oauth(); const { tokens } = await c.getToken(String(req.query.code)); c.setCredentials(tokens);
    const { data: p } = await google.oauth2({ version: 'v2', auth: c }).userinfo.get();
    if (!p.id || !p.email) throw new Error('Incomplete profile');
    const user = await prisma.user.upsert({ where: { googleId: p.id }, update: { name: p.name || p.email, image: p.picture }, create: { googleId: p.id, email: p.email, name: p.name || p.email, image: p.picture, categories: { create: DEFAULT_CATS.map(([name, color]) => ({ name, color })) } } });
    const granted = (tokens.scope || '').includes('calendar');
    const data = { accessToken: encrypt(tokens.access_token!), tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null, calendarConnected: granted, ...(tokens.refresh_token && { refreshToken: encrypt(tokens.refresh_token) }) };
    await prisma.googleAccount.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
    res.cookie('session', jwt.sign({ sub: user.id }, env.SESSION_SECRET, { expiresIn: '7d' }), cookieOpts);
    res.redirect(`${env.FRONTEND_URL}/notes`);
  } catch (e) { console.error(e); res.redirect(`${env.FRONTEND_URL}/?error=auth_failed`); }
});
r.get('/me', requireAuth, async (req: AuthReq, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, image: true } });
  u ? res.json(u) : res.status(401).json({ error: 'Not authenticated' });
});
r.post('/logout', (_q, res) => { res.clearCookie('session', { ...cookieOpts, maxAge: undefined }); res.json({ ok: true }); });
export default r;
