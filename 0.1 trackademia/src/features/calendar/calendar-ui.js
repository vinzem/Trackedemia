/** Calendar connection UI blocks (settings card, inline prompts). */
import { icon } from '../../components/icons.js';
import { formatTimestamp } from '../../utils/date-utils.js';
import { html } from '../../utils/helpers.js';

export function connectionCard({ calendar, calendars, profile }) {
  if (!calendar.loaded) {
    return html`<div class="card p-5"><div class="skeleton h-5 w-1/2"></div><div class="skeleton mt-3 h-4 w-3/4"></div></div>`;
  }
  if (calendar.configured === false) {
    return html`<div class="alert alert--warning">${icon('info')}<div><p class="font-semibold">Google Calendar is not configured on the server</p><p>Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY on the API to enable calendar sync.</p></div></div>`;
  }
  if (!calendar.connected) {
    return html`
      <div class="card p-5">
        <div class="flex items-start gap-3">
          <div class="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">${icon('calendar')}</div>
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold">${calendar.needs_reconnect ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</h3>
            <p class="mt-1 text-sm text-ink-muted">${calendar.needs_reconnect
              ? 'Access expired or was revoked in your Google account. Reconnect to keep syncing reminders.'
              : 'Trackademia only creates, updates and deletes events you confirm. It can see your calendar list so you can choose where events go.'}</p>
            <button class="btn btn--primary mt-4" type="button" data-action="connect-calendar">${icon('google')}<span>${calendar.needs_reconnect ? 'Reconnect' : 'Connect Google Calendar'}</span></button>
          </div>
        </div>
      </div>`;
  }
  return html`
    <div class="card p-5">
      <div class="flex flex-wrap items-start gap-3">
        <div class="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-success-soft text-success">${icon('calendarCheck')}</div>
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold">Google Calendar connected</h3>
          <p class="text-sm text-ink-muted">${calendar.google_account_email || 'Google account'}${calendar.connected_at ? html` · since ${formatTimestamp(calendar.connected_at)}` : ''}</p>
        </div>
        <span class="badge badge--success">${icon('check', { size: 12 })}Active</span>
      </div>
      <div class="mt-5">
        <label class="field__label" for="default-calendar">Default calendar for new reminders</label>
        <select class="select mt-1.5" id="default-calendar" data-action="choose-default-calendar">
          ${calendars.map((c) => html`<option value="${c.id}"${c.id === profile?.default_calendar_id ? html` selected` : ''}>${c.name}${c.primary ? ' (primary)' : ''}</option>`)}
        </select>
        <p class="field__hint mt-1.5">Calendar ID: <code class="break-all font-mono">${profile?.default_calendar_id || '—'}</code></p>
      </div>
      <div class="mt-5 flex flex-wrap gap-2">
        <button class="btn btn--secondary btn--sm" type="button" data-action="refresh-calendars">${icon('refresh', { size: 16 })}<span>Refresh calendars</span></button>
        <button class="btn btn--danger-ghost btn--sm" type="button" data-action="disconnect-calendar">${icon('unlink', { size: 16 })}<span>Disconnect</span></button>
      </div>
    </div>`;
}
