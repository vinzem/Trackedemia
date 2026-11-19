import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
export interface AuthReq extends Request { userId?: string }
export const requireAuth = (req: AuthReq, res: Response, next: NextFunction) => {
  try { req.userId = (jwt.verify(req.cookies.session, env.SESSION_SECRET) as any).sub; next(); }
  catch { res.status(401).json({ error: 'Not authenticated' }); }
};
// CSRF: cookies are SameSite=Lax and mutating requests must carry a custom header (forces a CORS preflight cross-site).
export const csrfGuard = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.header('X-Requested-With') !== 'trackademia') return res.status(403).json({ error: 'CSRF check failed' });
  next();
};
export const errorHandler = (err: any, _q: Request, res: Response, _n: NextFunction) => {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Invalid input', details: err.issues });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
};
