/**
 * Authentication state management: restores the session, reacts to sign-in /
 * sign-out / token refresh, loads the profile, and handles expired sessions.
 */
import { onUnauthorized } from '../../services/api-client.js';
import { storage } from '../../services/storage.js';
import { getState, resetState, setState } from '../../state.js';
import { detectTimezone } from '../../utils/timezone.js';
import { authService } from './auth-service.js';

let redirectAfterLogin = null;

async function loadAccount() {
  const { user, profile } = await authService.me();
  setState({ user, profile });
  // First run: adopt the browser timezone so relative dates resolve correctly.
  if (profile && profile.timezone === 'UTC' && detectTimezone() !== 'UTC' && !storage.get('tz-confirmed')) {
    const updated = await authService.updateProfile({ timezone: detectTimezone() }).catch(() => null);
    if (updated) setState({ profile: updated });
    storage.set('tz-confirmed', true);
  }
}

/**
 * @param {{ onSignedOut: Function, onSignedIn: Function, onExpired: Function }} handlers
 */
export async function initAuth({ onSignedOut, onSignedIn, onExpired }) {
  const session = await authService.getSession();
  setState({ session });
  if (session) {
    try {
      await loadAccount();
    } catch (error) {
      if (error.status === 401) {
        await authService.signOut();
        setState({ session: null });
      } else {
        setState({ accountError: error });
      }
    }
  }

  authService.onChange(async (event, nextSession) => {
    const hadSession = Boolean(getState().session);
    setState({ session: nextSession });
    if (event === 'SIGNED_OUT') {
      resetState();
      storage.clear();
      onSignedOut();
    } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && nextSession && !hadSession) {
      await loadAccount().catch(() => {});
      onSignedIn(redirectAfterLogin);
      redirectAfterLogin = null;
    } else if (event === 'PASSWORD_RECOVERY') {
      onSignedIn('/reset-password');
    }
  });

  onUnauthorized(async () => {
    if (!getState().session) return;
    await authService.signOut();
    onExpired();
  });
}

export function rememberRedirect(path) {
  if (path && path.startsWith('/') && !path.startsWith('/onboarding')) redirectAfterLogin = path;
}

export function isAuthenticated() {
  return Boolean(getState().session);
}

export async function signOut() {
  await authService.signOut();
  resetState();
  storage.clear();
}
