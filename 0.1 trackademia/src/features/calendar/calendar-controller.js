/** Loads calendar connection state into the store and handles OAuth returns. */
import { toast } from '../../components/toast.js';
import { getState, setState } from '../../state.js';
import { connectCalendar, disconnectCalendar, getCalendarStatus, listCalendars } from './calendar-service.js';

let pending = null;

export async function loadCalendarState({ force = false } = {}) {
  if (pending && !force) return pending;
  pending = (async () => {
    try {
      const status = await getCalendarStatus();
      let calendars = [];
      if (status.connected) {
        try {
          calendars = await listCalendars();
        } catch (error) {
          if (error.code === 'calendar_reauth_required') status.connected = false;
          status.needs_reconnect = error.code === 'calendar_reauth_required';
          status.error = error;
        }
      }
      const defaultCalendar = calendars.find((c) => c.is_default);
      setState({
        calendar: { ...status, loaded: true },
        calendars,
        ...(defaultCalendar && getState().profile ? { profile: { ...getState().profile, default_calendar_id: defaultCalendar.id, default_calendar_name: defaultCalendar.name } } : {}),
      });
    } catch (error) {
      setState({ calendar: { ...getState().calendar, loaded: true, error } });
    } finally {
      setTimeout(() => { pending = null; }, 0);
    }
    return getState().calendar;
  })();
  return pending;
}

const OAUTH_ERRORS = {
  access_denied: 'Google Calendar access was not granted.',
  scope_denied: 'Please allow Trackademia to view your calendars and manage events, then try again.',
  exchange_failed: 'Google sign-in did not complete. Please try again.',
  invalid_state: 'The connection link expired. Please try again.',
  server_error: 'Something went wrong while connecting. Please try again.',
};

/** Shows the result of the Google OAuth redirect (?calendar=connected|error). */
export function handleOAuthReturn(query) {
  const result = query.get('calendar');
  if (!result) return false;
  if (result === 'connected') {
    toast.success('Google Calendar connected', { detail: 'Detected dates can now become real calendar events.' });
  } else {
    toast.error('Could not connect Google Calendar', {
      detail: OAUTH_ERRORS[query.get('reason')] || OAUTH_ERRORS.server_error,
      actions: [{ label: 'Try again', onClick: () => startCalendarConnection(window.location.pathname) }],
    });
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('calendar');
  url.searchParams.delete('reason');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return true;
}

export async function startCalendarConnection(returnPath) {
  try {
    await connectCalendar(returnPath || window.location.pathname);
  } catch (error) {
    toast.error('Could not start Google Calendar connection', { detail: error.message });
  }
}

export async function disconnect() {
  await disconnectCalendar();
  setState({ calendar: { ...getState().calendar, connected: false, needs_reconnect: false, google_account_email: null }, calendars: [] });
}
