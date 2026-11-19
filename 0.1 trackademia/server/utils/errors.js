/** Typed application errors. Every error carries an HTTP status, a stable
 * machine-readable code, and optionally a suggested recovery action. */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', details, recovery, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.recovery = recovery;
    this.retryable = retryable;
  }
}

export const badRequest = (message, details) => new AppError(message, { status: 400, code: 'validation_error', details });
export const unauthorized = (message = 'Authentication required.', code = 'unauthorized') => new AppError(message, { status: 401, code, recovery: 'sign_in' });
export const forbidden = (message = 'You do not have access to this resource.') => new AppError(message, { status: 403, code: 'forbidden' });
export const notFound = (what = 'Resource') => new AppError(`${what} not found.`, { status: 404, code: 'not_found' });
export const conflict = (message, details) => new AppError(message, { status: 409, code: 'conflict', details });
export const notConfigured = (integration) => new AppError(
  `${integration} is not configured on this server.`,
  { status: 503, code: 'integration_not_configured', details: { integration } },
);

/** Maps a PostgREST / Postgres error from supabase-js to an AppError. */
export function fromDatabaseError(error, what = 'Resource') {
  if (!error) return null;
  if (error instanceof AppError) return error;
  switch (error.code) {
    case 'PGRST116': return notFound(what);
    case '23505': return conflict(`${what} already exists.`, { constraint: error.constraint || undefined });
    case '23503': return badRequest(`Referenced record for ${what.toLowerCase()} does not exist.`);
    case '23514':
    case '22P02':
    case '22007':
    case '22008': return badRequest(`Invalid ${what.toLowerCase()} data.`);
    case '42501': return forbidden();
    default: return new AppError('Database operation failed.', { status: 500, code: 'database_error', cause: error });
  }
}
