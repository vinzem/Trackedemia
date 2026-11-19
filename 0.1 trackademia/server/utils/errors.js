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

/** Calendar-specific errors with recovery hints the UI can act on. */
export const calendarErrors = {
  notConnected: () => new AppError('Google Calendar is not connected.', { status: 409, code: 'calendar_not_connected', recovery: 'connect_calendar' }),
  reauthRequired: () => new AppError('Google Calendar access expired or was revoked. Please reconnect.', { status: 401, code: 'calendar_reauth_required', recovery: 'connect_calendar' }),
  permissionDenied: () => new AppError('Trackademia does not have permission to change this calendar.', { status: 403, code: 'calendar_permission_denied', recovery: 'choose_calendar' }),
  calendarNotFound: () => new AppError('The selected calendar is no longer available.', { status: 404, code: 'calendar_not_found', recovery: 'choose_calendar' }),
  eventNotFound: () => new AppError('The Google Calendar event no longer exists.', { status: 404, code: 'calendar_event_not_found', recovery: 'recreate_event' }),
  unavailable: (cause) => new AppError('Google Calendar is temporarily unavailable. Try again shortly.', { status: 503, code: 'calendar_unavailable', recovery: 'retry', retryable: true, cause }),
  network: (cause) => new AppError('Could not reach Google Calendar. Check your connection and retry.', { status: 503, code: 'calendar_network_error', recovery: 'retry', retryable: true, cause }),
  rateLimited: () => new AppError('Google Calendar rate limit reached. Try again in a minute.', { status: 429, code: 'calendar_rate_limited', recovery: 'retry', retryable: true }),
  invalidRequest: (message) => new AppError(message || 'Google Calendar rejected the event details.', { status: 400, code: 'calendar_invalid_request', recovery: 'edit_event' }),
};

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
