/** Rendering helpers for the notes dashboard (kept free of data fetching). */
import { button } from '../../components/button.js';
import { emptyState } from '../../components/loading.js';
import { noteCard } from '../../components/note-card.js';
import { reminderCard } from '../../components/reminder-card.js';
import { isDueWithinDays } from '../../utils/date-utils.js';
import { html } from '../../utils/helpers.js';

export function notesList(notes, { query }) {
  if (!notes.length) {
    return query
      ? emptyState({ iconName: 'search', title: 'No matching notes', message: `Nothing found for “${query}”. Try a different word or clear the search.`, action: button({ label: 'Clear search', action: 'clear-search' }) })
      : emptyState({
        iconName: 'note',
        title: 'Your notes will live here',
        message: 'Write naturally, like “Dentist tomorrow at 10am”, and Trackademia will offer to add it to your calendar.',
        action: button({ label: 'Write your first note', variant: 'primary', iconName: 'plus', href: '/notes/new' }),
      });
  }
  return html`<div class="notes-grid">${notes.map(noteCard)}</div>`;
}

export function upcomingPanel(reminders) {
  return html`
    <aside class="space-y-3" aria-labelledby="upcoming-title">
      <div class="flex items-center justify-between">
        <h2 id="upcoming-title" class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Upcoming reminders</h2>
        <a class="text-sm font-semibold text-primary" href="/calendar" data-link>Open calendar</a>
      </div>
      ${reminders.length
        ? html`${reminders.slice(0, 6).map((reminder) => {
          const card = reminderCard(reminder, { compact: true, dueSoon: isDueWithinDays(reminder) });
          return reminder.note_id
            ? html`<a class="block no-underline" href="/notes/${reminder.note_id}" data-link>${card}</a>`
            : card;
        })}`
        : html`<p class="card p-4 text-sm text-ink-muted">No upcoming events. Dates you write in notes will appear here once added to your calendar.</p>`}
    </aside>`;
}
