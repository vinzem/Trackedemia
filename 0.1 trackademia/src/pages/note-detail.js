/**
 * Screen 06: note detail / manage reminders. Shows the note with highlighted
 * dates, linked calendar event cards and detected event suggestions,
 * and offers to add any detected event that is not yet on the calendar.
 */
import { icon } from '../components/icons.js';
import { errorState, spinner } from '../components/loading.js';
import { confirmDialog } from '../components/modal.js';
import { reminderCard } from '../components/reminder-card.js';
import { toast } from '../components/toast.js';
import { detectLocally } from '../features/detection/detection-service.js';
import { highlightedPreview } from '../features/detection/highlighting.js';
import { deleteNote, getNote } from '../features/notes/notes-service.js';
import { confirmDetectedEvent, editReminder, removeReminder } from '../features/reminders/reminder-controller.js';
import { listReminders } from '../features/reminders/reminder-service.js';
import { navigate } from '../router.js';
import { getState } from '../state.js';
import { formatTimestamp } from '../utils/date-utils.js';
import { deriveTitle, html, mount } from '../utils/helpers.js';
import { detectTimezone } from '../utils/timezone.js';

export async function render(ctx) {
  const { main, params } = ctx;
  ctx.setNavbar({ title: 'Note', back: '/notes' });
  mount(main, spinner('Loading note…'));

  let note;
  let reminders = [];
  let events = [];

  const timezone = () => getState().profile?.timezone || detectTimezone();

  async function load() {
    try {
      note = await getNote(params.id);
      reminders = await listReminders({ note_id: note.id });
    } catch (error) {
      mount(main, errorState({ title: error.status === 404 ? 'Note not found' : 'Could not load this note', message: error.status === 404 ? 'It may have been deleted on another device.' : error.message }));
      return false;
    }
    events = detectLocally(note.content, timezone()).events;
    draw();
    return true;
  }

  function pendingEvents() {
    return events.filter((event) => !event.is_past && !reminders.some((r) => r.source_text && r.source_text === event.source_text));
  }

  function draw() {
    const title = note.title?.trim() || deriveTitle(note.content);
    ctx.setTitle(title);
    ctx.setNavbar({
      title,
      back: '/notes',
      actions: html`<a class="icon-btn" href="/notes/${note.id}/edit" data-link aria-label="Edit note">${icon('edit')}</a>`,
    });
    const suggestions = pendingEvents();
    mount(main, html`
      <div class="page page--narrow">
        <a class="btn btn--ghost btn--sm -ml-3 mb-3 hidden lg:inline-flex" href="/notes" data-link>${icon('back', { size: 16 })}<span>All notes</span></a>
        <article class="card p-5 sm:p-6">
          <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-2xl font-bold tracking-tight">${title}</h1>
              <p class="mt-1 text-xs text-ink-muted">
                <span>Created <time datetime="${note.created_at}">${formatTimestamp(note.created_at)}</time></span>
                <span aria-hidden="true"> · </span>
                <span>Updated <time datetime="${note.updated_at}">${formatTimestamp(note.updated_at)}</time></span>
              </p>
            </div>
            <div class="flex gap-2">
              <a class="btn btn--secondary btn--sm" href="/notes/${note.id}/edit" data-link>${icon('edit', { size: 16 })}<span>Edit note</span></a>
              <button class="btn btn--danger-ghost btn--sm" type="button" data-action="delete-note">${icon('trash', { size: 16 })}<span>Delete</span></button>
            </div>
          </header>
          ${note.content.trim() ? highlightedPreview(note.content, events, reminders) : html`<p class="text-ink-muted">This note is empty.</p>`}
        </article>

        <section class="mt-6" aria-labelledby="reminders-title">
          <div class="mb-3 flex items-center justify-between">
            <h2 id="reminders-title" class="text-sm font-semibold uppercase tracking-wide text-ink-muted">Linked reminders</h2>
            <button class="btn btn--ghost btn--sm" type="button" data-action="refresh">${icon('refresh', { size: 16 })}<span>Refresh</span></button>
          </div>
          <div class="space-y-3">
            ${reminders.length ? reminders.map((r) => reminderCard(r)) : html`<p class="card p-4 text-sm text-ink-muted">No events yet.${suggestions.length ? ' Add one of the detected events below.' : ' Dates you write in this note can be added to your calendar.'}</p>`}
          </div>
        </section>

        ${suggestions.length ? html`
          <section class="mt-6" aria-labelledby="suggestions-title">
            <h2 id="suggestions-title" class="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Detected in this note</h2>
            <div class="flex flex-wrap gap-2">
              ${suggestions.map((event, index) => html`
                <button class="detection-chip" type="button" data-action="add-suggestion" data-index="${index}">
                  <span class="text-primary">${icon('plus', { size: 16 })}</span>
                  <span class="truncate font-medium">${event.event_title || 'Event'}</span>
                  <span class="text-xs text-ink-muted">${event.source_text}</span>
                </button>`)}
            </div>
          </section>` : ''}
      </div>`);
  }

  const replaceReminder = (updated, meta = {}) => {
    if (meta.refresh) return load();
    if (updated) reminders = reminders.map((r) => (r.id === updated.id ? updated : r));
    draw();
    return undefined;
  };

  async function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    const reminder = reminders.find((r) => r.id === id);
    if (action === 'retry') load();
    if (action === 'refresh') { await load(); toast.info('Up to date'); }
    if (action === 'edit-reminder' && reminder) editReminder(reminder, { onUpdated: replaceReminder });
    if (action === 'delete-reminder' && reminder) {
      removeReminder(reminder, { onDeleted: () => { reminders = reminders.filter((r) => r.id !== reminder.id); draw(); } });
    }
    if (action === 'add-suggestion') {
      const suggestion = pendingEvents()[Number(target.dataset.index)];
      if (!suggestion) return;
      confirmDetectedEvent({
        event: suggestion,
        ensureNote: async () => note,
        onCreated: (created) => {
          reminders = [...reminders.filter((r) => r.id !== created.id), created];
          draw();
          toast.success('Added to your calendar', { detail: created.event_title });
        },
      });
    }
    if (action === 'delete-note') {
      const answer = await confirmDialog({
        title: 'Delete this note?',
        message: 'This cannot be undone. Calendar events linked to this note will stay in your Trackademia calendar.',
        confirmLabel: 'Delete note',
        danger: true,
      });
      if (answer === 'cancel') return;
      try {
        await deleteNote(note.id);
        toast.success('Note deleted');
        navigate('/notes', { replace: true });
      } catch (error) {
        toast.error('Could not delete note', { detail: error.message });
        load();
      }
    }
  }

  main.addEventListener('click', onClick);
  await load();
  return () => main.removeEventListener('click', onClick);
}
