/**
 * Express application factory. All collaborators are injected so tests can
 * run the real HTTP stack against in-memory fakes.
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthMiddleware } from './middleware/auth.middleware.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { createRateLimiters } from './middleware/rate-limit.middleware.js';
import { aiRoutes } from './routes/ai.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { calendarRoutes } from './routes/calendar.routes.js';
import { notesRoutes } from './routes/notes.routes.js';
import { remindersRoutes } from './routes/reminders.routes.js';
import { createAiExtractionService } from './services/ai-extraction.service.js';
import { createAuthService } from './services/auth.service.js';
import { createGoogleCalendarService } from './services/google-calendar.service.js';
import { createRemindersService } from './services/reminders.service.js';
import { createCipher } from './utils/crypto.js';
import { logger as defaultLogger } from './utils/logger.js';

export function buildServices({ config, database, fetchImpl = globalThis.fetch, logger = defaultLogger, authService }) {
  const cipher = config.encryptionKey ? createCipher(config.encryptionKey) : null;
  const calendar = createGoogleCalendarService({ config, adminDb: database?.admin, cipher, fetchImpl, logger });
  return {
    auth: authService || createAuthService({ database }),
    calendar,
    reminders: createRemindersService({ calendar, config, logger }),
    extraction: createAiExtractionService({ config, fetchImpl, logger }),
  };
}

export function createApp({ config, services, logger = defaultLogger, rateLimit = true }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(cors({
    origin(origin, callback) {
      // Non-browser requests (no Origin) are allowed; browsers must match the allowlist.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const started = Date.now();
    res.on('finish', () => logger.info('request', { method: req.method, path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || req.path, status_code: res.statusCode, ms: Date.now() - started }));
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      data: {
        status: 'ok',
        uptime_s: Math.round(process.uptime()),
        integrations: {
          database: config.features.database,
          openai: services.extraction.isAiEnabled(),
          google_calendar: services.calendar.isConfigured(),
        },
      },
    });
  });

  const requireAuth = createAuthMiddleware({ authService: services.auth });
  const limits = createRateLimiters({ disabled: !rateLimit });
  const deps = { requireAuth, limits, services, config, logger };

  app.use('/api/auth', authRoutes(deps));
  app.use('/api/notes', notesRoutes(deps));
  app.use('/api/reminders', remindersRoutes(deps));
  app.use('/api/calendar', calendarRoutes(deps));
  app.use('/api/ai', aiRoutes(deps));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, isProduction: config.isProduction }));
  return app;
}
