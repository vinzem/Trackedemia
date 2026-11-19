/** Note summary card for the dashboard list. */
import { formatRelative, formatLocalDate, formatTime, localFieldsFromInstants } from '../utils/date-utils.js';
import { deriveTitle, html, truncate } from '../utils/helpers.js';
import { icon } from './icons.js';

function reminderBadge(reminders = []) {
  if (!reminders.length) return '';
  const next = reminders.find((r) => new Date(r.end_datetime) > new Date()) || reminders[0];
  const local = localFieldsFromInstants(next);
  const when = `${formatLocalDate(local.start_date)}${next.all_day ? '' : ` · ${formatTime(local.start_time)}`}`;
  const extra = reminders.length > 1 ? ` +${reminders.length - 1}` : '';
  return html`<span class="badge badge--success" title="In your Trackademia calendar">${icon('calendarCheck', { size: 12 })}${when}${extra}</span>`;
}

export function noteCard(note) {
  const title = note.title?.trim() || deriveTitle(note.content);
  const preview = truncate(note.title?.trim() ? note.content : note.content.split('\n').slice(1).join(' '), 160);
  return html`
    <a class="card card--interactive flex min-h-[132px] flex-col p-4 no-underline" href="/notes/${note.id}" data-link data-note-id="${note.id}">
      <h3 class="line-clamp-1 font-semibold">${title}</h3>
      <p class="mt-1 line-clamp-3 flex-1 text-sm text-ink-muted">${preview || 'No additional text'}</p>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-ink-muted">Edited ${formatRelative(note.updated_at)}</span>
        ${reminderBadge(note.reminders)}
      </div>
    </a>`;
}
