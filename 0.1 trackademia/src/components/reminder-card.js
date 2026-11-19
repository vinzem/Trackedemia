/** Linked-reminder card used on the note detail screen and calendar panel. */
import { REMINDER_STATUS } from '../utils/constants.js';
import { formatReminderWhen } from '../utils/date-utils.js';
import { html } from '../utils/helpers.js';
import { icon } from './icons.js';

export function statusBadge(status) {
  const meta = REMINDER_STATUS[status] || REMINDER_STATUS.pending;
  const iconName = status === 'synced' ? 'check' : status === 'failed' ? 'alert' : 'clock';
  return html`<span class="badge badge--${meta.tone}" data-status="${status}">${icon(iconName, { size: 12 })}${meta.label}</span>`;
}

export function reminderCard(reminder, { compact = false } = {}) {
  const actions = compact ? '' : html`
    <div class="mt-4 flex flex-wrap gap-2">
      ${reminder.google_event_link ? html`<a class="btn btn--secondary btn--sm" href="${reminder.google_event_link}" target="_blank" rel="noopener noreferrer">${icon('external', { size: 16 })}<span>Open in Google Calendar</span></a>` : ''}
      ${reminder.status === 'failed' || reminder.status === 'pending' ? html`<button class="btn btn--primary btn--sm" type="button" data-action="retry-reminder" data-id="${reminder.id}">${icon('refresh', { size: 16 })}<span>${reminder.status === 'failed' ? 'Retry sync' : 'Add to Google Calendar'}</span></button>` : ''}
      <button class="btn btn--secondary btn--sm" type="button" data-action="edit-reminder" data-id="${reminder.id}">${icon('edit', { size: 16 })}<span>Edit</span></button>
      <button class="btn btn--danger-ghost btn--sm" type="button" data-action="delete-reminder" data-id="${reminder.id}">${icon('trash', { size: 16 })}<span>Delete</span></button>
    </div>`;
  return html`
    <article class="card p-4" data-reminder-id="${reminder.id}" aria-label="Reminder: ${reminder.event_title}">
      <div class="flex items-start gap-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-md ${reminder.status === 'synced' ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary'}">${icon(reminder.status === 'synced' ? 'calendarCheck' : 'calendar')}</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold">${reminder.event_title}</h3>
            ${statusBadge(reminder.status)}
          </div>
          <p class="mt-0.5 text-sm">${formatReminderWhen(reminder)}</p>
          <p class="text-xs text-ink-muted">${reminder.calendar_name || 'No calendar selected'} · ${reminder.timezone}</p>
          ${reminder.status === 'failed' && reminder.sync_error ? html`<p class="mt-2 text-sm text-danger">${reminder.sync_error}</p>` : ''}
          ${!compact && reminder.event_description ? html`<p class="mt-2 whitespace-pre-line text-sm text-ink-muted">${reminder.event_description}</p>` : ''}
        </div>
      </div>
      ${actions}
    </article>`;
}
