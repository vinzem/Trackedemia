/** Rate limiters keyed by authenticated user when available, else by IP. */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../utils/errors.js';

function limiter({ windowMs, limit, name }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || '')}`),
    handler: (_req, _res, next) => next(new AppError('Too many requests. Please slow down.', {
      status: 429, code: 'rate_limited', retryable: true, details: { limiter: name },
    })),
  });
}

export const createRateLimiters = ({ disabled = false } = {}) => {
  const pass = (_req, _res, next) => next();
  if (disabled) return { api: pass, ai: pass, oauth: pass };
  return {
    api: limiter({ windowMs: 15 * 60 * 1000, limit: 600, name: 'api' }),
    ai: limiter({ windowMs: 60 * 1000, limit: 20, name: 'ai' }),
    oauth: limiter({ windowMs: 15 * 60 * 1000, limit: 30, name: 'oauth' }),
  };
};
