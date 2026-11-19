/**
 * Account settings: profile, timezone, AI privacy controls, Google Calendar
 * connection (connect, default calendar, disconnect) and session actions.
 */
import { setButtonLoading } from '../components/button.js';
import { icon } from '../components/icons.js';
import { field, showFieldErrors } from '../components/input.js';
import { confirmDialog } from '../components/modal.js';
import { avatar } from '../components/sidebar.js';
import { toast } from '../components/toast.js';
import { signOut } from '../features/auth/auth-controller.js';
import { authService } from '../features/auth/auth-service.js';
import { disconnect, loadCalendarState, startCalendarConnection } from '../features/calendar/calendar-controller.js';
import { connectionCard } from '../features/calendar/calendar-ui.js';
import { getState, setState, subscribe } from '../state.js';
import { formValues, html, mount } from '../utils/helpers.js';
import { detectTimezone, listTimezones, offsetLabel } from '../utils/timezone.js';

export async function render(ctx) {
  const { main } = ctx;
  ctx.setTitle('Settings');
  ctx.setNavbar({ title: 'Settings', back: '/notes' });
  const { user, profile } = getState();

  mount(main, html`
    <div class="page page--narrow space-y-8">
      <h1 class="page-title hidden lg:block">Settings</h1>

      <section aria-labelledby="profile-title" class="space-y-3">
        <h2 id="profile-title" class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Profile</h2>
        <form class="card space-y-4 p-5" data-form="profile" novalidate>
          <div class="flex items-center gap-3">
            ${avatar(user, profile)}
            <div class="min-w-0"><p class="truncate font-semibold">${user?.email || ''}</p><p class="text-xs text-ink-muted">Signed in with ${user?.provider === 'google' ? 'Google' : 'email'}${user?.emailConfirmed ? ' · verified' : ''}</p></div>
          </div>
          ${field({ name: 'display_name', label: 'Display name', value: profile?.display_name || '', maxlength: 80, autocomplete: 'name' })}
          <div class="field" data-field="timezone">
            <label class="field__label" for="settings-timezone">Timezone</label>
            <select class="select" id="settings-timezone" name="timezone">
              ${listTimezones().map((zone) => html`<option value="${zone}"${zone === (profile?.timezone || detectTimezone()) ? html` selected` : ''}>${zone.replace(/_/g, ' ')} (${offsetLabel(zone)})</option>`)}
            </select>
            <p class="field__hint">Used to resolve words like “tomorrow” and for new events. This device is set to ${detectTimezone()}.</p>
            <p class="field__error" role="alert" hidden></p>
          </div>
          <button class="btn btn--primary" type="submit">Save profile</button>
        </form>
      </section>

      <section id="calendar" aria-labelledby="calendar-title" class="space-y-3">
        <h2 id="calendar-title" class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Google Calendar</h2>
        <div data-calendar></div>
      </section>

      <section aria-labelledby="privacy-title" class="space-y-3">
        <h2 id="privacy-title" class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Privacy &amp; AI detection</h2>
        <div class="card space-y-4 p-5">
          <label class="flex items-start gap-3">
            <input class="checkbox mt-0.5" type="checkbox" data-action="toggle-ai"${profile?.ai_detection_enabled !== false ? html` checked` : ''} />
            <span><span class="block font-semibold">Use AI to detect events</span>
            <span class="block text-sm text-ink-muted">When on, only sentences that look like they contain a date or time are sent to OpenAI from our server, with emails, phone numbers and links removed. OpenAI is asked not to store them. When off, detection runs with built-in rules only.</span></span>
          </label>
          <div class="alert alert--info">${icon('shield')}<p>Your Google tokens are encrypted on our server and are never sent to your browser. Events are only created after you confirm them.</p></div>
        </div>
      </section>

      <section aria-labelledby="account-title" class="space-y-3">
        <h2 id="account-title" class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Account</h2>
        <div class="card flex flex-wrap gap-2 p-5">
          ${user?.provider !== 'google' ? html`<button class="btn btn--secondary" type="button" data-action="reset-password">${icon('lock', { size: 18 })}<span>Change password</span></button>` : ''}
          <button class="btn btn--secondary" type="button" data-action="sign-out">${icon('logout', { size: 18 })}<span>Sign out</span></button>
        </div>
      </section>
    </div>`);

  const calendarEl = main.querySelector('[data-calendar]');
  const drawCalendar = () => mount(calendarEl, connectionCard(getState()));
  drawCalendar();
  const unsubscribe = subscribe(drawCalendar);
  loadCalendarState({ force: true });
  if (window.location.hash === '#calendar') requestAnimationFrame(() => document.getElementById('calendar')?.scrollIntoView());

  async function onSubmit(event) {
    const form = event.target.closest('form[data-form=profile]');
    if (!form) return;
    event.preventDefault();
    const values = formValues(form);
    const submit = form.querySelector('[type=submit]');
    const restore = setButtonLoading(submit, 'Saving…');
    try {
      const updated = await authService.updateProfile({ display_name: values.display_name.trim() || undefined, timezone: values.timezone });
      setState({ profile: updated });
      toast.success('Profile saved');
    } catch (error) {
      if (Array.isArray(error.details)) showFieldErrors(form, Object.fromEntries(error.details.map((d) => [d.path, d.message])));
      else toast.error('Could not save profile', { detail: error.message });
    } finally {
      restore();
    }
  }

  async function onChange(event) {
    if (event.target.matches('[data-action=toggle-ai]')) {
      try {
        const updated = await authService.updateProfile({ ai_detection_enabled: event.target.checked });
        setState({ profile: updated });
        toast.success(updated.ai_detection_enabled ? 'AI detection on' : 'AI detection off');
      } catch (error) {
        event.target.checked = !event.target.checked;
        toast.error('Could not update setting', { detail: error.message });
      }
    }
    if (event.target.matches('[data-action=choose-default-calendar]')) {
      const chosen = getState().calendars.find((c) => c.id === event.target.value);
      try {
        const updated = await authService.updateProfile({ default_calendar_id: chosen.id, default_calendar_name: chosen.name });
        setState({ profile: updated, calendars: getState().calendars.map((c) => ({ ...c, is_default: c.id === chosen.id })) });
        toast.success('Default calendar updated', { detail: chosen.name });
      } catch (error) {
        toast.error('Could not update default calendar', { detail: error.message });
      }
    }
  }

  async function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'connect-calendar') {
      setButtonLoading(target, 'Opening Google…');
      startCalendarConnection('/settings');
    }
    if (action === 'refresh-calendars') {
      const restore = setButtonLoading(target, 'Refreshing…');
      await loadCalendarState({ force: true });
      restore();
    }
    if (action === 'disconnect-calendar') {
      const answer = await confirmDialog({
        title: 'Disconnect Google Calendar?',
        message: 'Trackademia will lose access and delete its stored Google tokens. Events already created stay on your calendar.',
        confirmLabel: 'Disconnect',
        danger: true,
      });
      if (answer !== 'confirm') return;
      try {
        await disconnect();
        toast.success('Google Calendar disconnected');
      } catch (error) {
        toast.error('Could not disconnect', { detail: error.message });
      }
    }
    if (action === 'reset-password') {
      try {
        await authService.requestPasswordReset(getState().user.email);
        toast.success('Password reset email sent', { detail: getState().user.email });
      } catch (error) {
        toast.error('Could not send reset email', { detail: error.message });
      }
    }
    if (action === 'sign-out') {
      await signOut();
    }
  }

  main.addEventListener('submit', onSubmit);
  main.addEventListener('change', onChange);
  main.addEventListener('click', onClick);
  return () => {
    unsubscribe();
    main.removeEventListener('submit', onSubmit);
    main.removeEventListener('change', onChange);
    main.removeEventListener('click', onClick);
  };
}
