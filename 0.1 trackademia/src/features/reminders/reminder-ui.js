/** Calendar-sync success state shown inside the note editor (Screen 05). */
import { icon } from '../../components/icons.js';
import { formatLocalDate, formatTime } from '../../utils/date-utils.js';
import { html } from '../../utils/helpers.js';

export function syncSuccessPanel(reminder) {
  const { local = {} } = reminder;
  return html`
    <section class="alert alert--success items-start" role="status" aria-live="polite" data-success-reminder="${reminder.id}">
      <span class="mt-0.5 text-success">${icon('checkCircle')}</span>
      <div class="min-w-0 flex-1">
        <p class="font-semibold">Added to Google Calendar</p>
        <dl class="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt class="text-ink-muted">Event</dt><dd class="font-medium">${reminder.event_title}</dd>
          <dt class="text-ink-muted">Date</dt><dd>${formatLocalDate(local.start_date)}</dd>
          <dt class="text-ink-muted">Time</dt><dd>${reminder.all_day ? 'All day' : `${formatTime(local.start_time)}${local.end_time ? ` – ${formatTime(local.end_time)}` : ''}`} <span class="text-ink-muted">(${reminder.timezone})</span></dd>
          <dt class="text-ink-muted">Calendar</dt><dd>${reminder.calendar_name || 'Google Calendar'}</dd>
        </dl>
        <div class="mt-3 flex flex-wrap gap-2">
          ${reminder.google_event_link ? html`<a class="btn btn--secondary btn--sm" href="${reminder.google_event_link}" target="_blank" rel="noopener noreferrer">${icon('external', { size: 16 })}<span>Open in Google Calendar</span></a>` : ''}
          <button class="btn btn--ghost btn--sm" type="button" data-action="undo-reminder" data-id="${reminder.id}">${icon('undo', { size: 16 })}<span>Undo</span></button>
        </div>
      </div>
      <button class="icon-btn -mr-2 -mt-2" type="button" data-action="close-success" aria-label="Dismiss">${icon('close', { size: 18 })}</button>
    </section>`;
}

/** Chips listing detected events so the user can review each one. */
export function detectionChips(events, { pending, synced = [] }) {
  if (!events.length && !pending) return '';
  return html`
    <div class="flex flex-wrap items-center gap-2" aria-label="Detected events">
      ${events.map((event, index) => {
        const isSynced = synced.some((r) => r.source_text && r.source_text === event.source_text);
        const allDayCandidate = event.start_date && !event.start_time && !event.clarification;
        const status = isSynced ? 'On calendar' : event.is_past ? 'Past' : allDayCandidate ? 'All day' : event.missing_fields?.length ? 'Needs details' : 'Review';
        return html`
          <button class="detection-chip" type="button" data-action="review-event" data-index="${index}" ${isSynced ? html`aria-disabled="true"` : ''}>
            <span class="${isSynced ? 'text-success' : 'text-primary'}">${icon(isSynced ? 'calendarCheck' : 'bell', { size: 16 })}</span>
            <span class="truncate font-medium">${event.event_title || 'Untitled event'}</span>
            <span class="badge ${isSynced ? 'badge--success' : (event.missing_fields?.length && !allDayCandidate) || event.is_past ? 'badge--warning' : 'badge--primary'}">${status}</span>
          </button>`;
      })}
      ${pending ? html`<span class="inline-flex items-center gap-2 text-xs text-ink-muted" role="status"><span class="spinner h-3.5 w-3.5"></span>Checking with AI…</span>` : ''}
    </div>`;
}
