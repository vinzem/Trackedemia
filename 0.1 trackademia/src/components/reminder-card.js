/** Linked-reminder card used on the note detail screen and calendar panel. */
import { REMINDER_STATUS } from '../utils/constants.js';
import { formatReminderWhen } from '../utils/date-utils.js';
import { html } from '../utils/helpers.js';
import { icon } from './icons.js';

export function statusBadge(status) {
  const meta = REMINDER_STATUS[status] || REMINDER_STATUS.pending;
  return html`<span class="badge badge--${meta.tone}" data-status="${status}">${icon('check', { size: 12 })}${meta.label}</span>`;
}

export function reminderCard(reminder, { compact = false, dueSoon = false } = {}) {
  const actions = compact ? '' : html`
    <div class="mt-4 flex flex-wrap gap-2">
      <button class="btn btn--secondary btn--sm" type="button" data-action="edit-reminder" data-id="${reminder.id}">${icon('edit', { size: 16 })}<span>Edit</span></button>
      <button class="btn btn--danger-ghost btn--sm" type="button" data-action="delete-reminder" data-id="${reminder.id}">${icon('trash', { size: 16 })}<span>Delete</span></button>
    </div>`;
  return html`
    <article class="card p-4 ${dueSoon ? 'border-danger bg-danger-soft' : ''}" data-reminder-id="${reminder.id}" data-due-soon="${dueSoon}" aria-label="Reminder: ${reminder.event_title}">
      <div class="flex items-start gap-3">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-md ${dueSoon ? 'bg-danger text-white' : 'bg-success-soft text-success'}">${icon('calendarCheck')}</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold">${reminder.event_title}</h3>
            ${statusBadge(reminder.status)}
            ${dueSoon ? html`<span class="badge badge--error">Due soon</span>` : ''}
          </div>
          <p class="mt-0.5 text-sm ${dueSoon ? 'font-semibold text-danger' : ''}">${formatReminderWhen(reminder)}</p>
          <p class="text-xs text-ink-muted">Trackademia calendar · ${reminder.timezone}</p>
          ${!compact && reminder.event_description ? html`<p class="mt-2 whitespace-pre-line text-sm text-ink-muted">${reminder.event_description}</p>` : ''}
        </div>
      </div>
      ${actions}
    </article>`;
}
