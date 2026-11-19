/** Centralised error handling: one consistent JSON shape for every failure. */
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(`No route for ${req.method} ${req.path}`, { status: 404, code: 'route_not_found' }));
}

export function createErrorHandler({ logger, isProduction }) {
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(error, req, res, _next) {
    let appError = error;
    if (error instanceof ZodError) {
      appError = new AppError('Request validation failed.', {
        status: 400,
        code: 'validation_error',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    } else if (error?.type === 'entity.parse.failed') {
      appError = new AppError('Malformed JSON body.', { status: 400, code: 'invalid_json' });
    } else if (error?.type === 'entity.too.large') {
      appError = new AppError('Request body too large.', { status: 413, code: 'payload_too_large' });
    } else if (!(error instanceof AppError)) {
      appError = new AppError('Something went wrong.', { status: 500, code: 'internal_error', cause: error });
    }

    const meta = { method: req.method, path: req.path, status: appError.status, error_code: appError.code, user: req.user?.id };
    if (appError.status >= 500) logger.error('request_failed', { ...meta, cause: appError.cause || error });
    else logger.warn('request_rejected', meta);

    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.status >= 500 && isProduction && appError.code === 'internal_error' ? 'Something went wrong.' : appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        ...(appError.recovery ? { recovery: appError.recovery } : {}),
        ...(appError.retryable ? { retryable: true } : {}),
      },
    });
  };
}
