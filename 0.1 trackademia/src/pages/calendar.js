/** First-party month calendar backed by the user's saved reminders. */
import { DateTime } from 'luxon';
import { openReminderSheet } from '../components/reminder-sheet.js';
import { toast } from '../components/toast.js';
import { editReminder, removeReminder } from '../features/reminders/reminder-controller.js';
import { createReminder, listReminders } from '../features/reminders/reminder-service.js';
import { getState } from '../state.js';
import { formatReminderWhen } from '../utils/date-utils.js';
import { html, mount } from '../utils/helpers.js';
import { detectTimezone } from '../utils/timezone.js';

const p2 = (value) => String(value).padStart(2, '0');
const dateKey = (date) => `${date.year}-${p2(date.month)}-${p2(date.day)}`;

export async function render(ctx) {
  const { main } = ctx;
  const timezone = () => getState().profile?.timezone || detectTimezone();
  let month = DateTime.now().setZone(timezone()).startOf('month');
  let selectedDate = dateKey(DateTime.now().setZone(timezone()));
  let view = 'month';
  let events = [];
  let error = '';
  let lastWheelAt = 0;

  ctx.setTitle('Calendar');
  ctx.setNavbar({ title: 'Calendar', back: '/notes' });

  function draw() {
    const firstDay = month.startOf('month');
    const offset = firstDay.weekday % 7;
    const days = month.daysInMonth;
    const cells = Math.ceil((offset + days) / 7) * 7;
    const now = DateTime.now().setZone(timezone());
    const selected = DateTime.fromISO(selectedDate, { zone: timezone() });
    const selectedEvents = events.filter((event) => event.local?.start_date === selectedDate);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const year = month.year;

    mount(main, html`
      <div class="page">
        <header class="page-header">
          <div>
            <h1 class="page-title">
              ${view === 'month'
                ? html`<button class="inline-flex items-center gap-2 text-left hover:text-primary" type="button" data-action="choose-year" aria-label="${month.toFormat('LLLL yyyy')}, choose month and year">${month.toFormat('LLLL yyyy')}<span class="text-base text-ink-muted" aria-hidden="true">⌄</span></button>`
                : html`${year}`}
            </h1>
            <p class="text-sm text-ink-muted">Events saved to your Trackademia account</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn--secondary" type="button" data-action="previous" aria-label="Previous ${view === 'year' ? 'year' : 'month'}">‹</button>
            <button class="btn btn--secondary" type="button" data-action="today">Today</button>
            <button class="btn btn--secondary" type="button" data-action="next" aria-label="Next ${view === 'year' ? 'year' : 'month'}">›</button>
            <button class="btn btn--primary" type="button" data-action="add">Add event</button>
          </div>
        </header>
        ${error ? html`<p class="alert alert--error mb-4" role="alert">${error}<button class="btn btn--ghost btn--sm ml-auto" type="button" data-action="refresh">Retry</button></p>` : ''}
        <section class="overflow-hidden rounded-xl border border-line bg-white" aria-label="Calendar" data-calendar-surface>
          ${view === 'year'
            ? html`
              <div class="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 sm:gap-4 sm:p-6">
                ${Array.from({ length: 12 }, (_, index) => {
                  const monthNumber = index + 1;
                  const monthDate = month.set({ month: monthNumber }).startOf('month');
                  const keyPrefix = `${year}-${p2(monthNumber)}-`;
                  const count = events.filter((event) => event.local?.start_date?.startsWith(keyPrefix)).length;
                  const isSelected = selected.year === year && selected.month === monthNumber;
                  return html`
                    <button class="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-4 text-sm font-medium transition-colors ${isSelected ? 'border-primary bg-primary text-white' : 'border-transparent hover:border-line hover:bg-soft'}" type="button" data-action="select-month" data-month="${monthNumber}" aria-label="${monthDate.toFormat('LLLL yyyy')}" aria-pressed="${isSelected}">
                      <span>${monthDate.toFormat('LLL')}</span>
                      ${count ? html`<span class="text-xs ${isSelected ? 'text-white/80' : 'text-ink-muted'}">${count} event${count === 1 ? '' : 's'}</span>` : ''}
                    </button>`;
                })}
              </div>`
            : html`
              <div class="grid grid-cols-7 bg-soft text-center text-sm font-medium">
                ${weekdays.map((day) => html`<div class="py-3">${day}</div>`)}
              </div>
              <div class="grid grid-cols-7" style="grid-template-rows: repeat(${cells / 7}, minmax(100px, 1fr))">
                ${Array.from({ length: cells }, (_, index) => {
                  const day = index - offset + 1;
                  if (day < 1 || day > days) return html`<div class="min-h-24 border-l border-t border-line bg-soft/40"></div>`;
                  const date = firstDay.set({ day });
                  const key = dateKey(date);
                  const dayEvents = events.filter((event) => event.local?.start_date === key);
                  return html`
                    <div class="min-h-24 border-l border-t border-line p-1.5 sm:p-2${key === selectedDate ? ' bg-primary/5' : ''}">
                      <button class="grid h-7 w-7 place-items-center rounded-full text-sm ${date.hasSame(now, 'day') ? 'bg-primary font-semibold text-white' : 'hover:bg-soft'}" type="button" data-action="select-date" data-date="${key}" aria-label="${date.toFormat('cccc, LLLL d')}" aria-pressed="${key === selectedDate}">${day}</button>
                      <div class="mt-1 space-y-1">
                        ${dayEvents.slice(0, 3).map((event) => html`
                          <button class="block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-xs font-medium text-primary" type="button" data-action="select-event" data-date="${key}" aria-label="${event.event_title}">
                            ${event.all_day ? '' : `${event.local?.start_time || ''} `}${event.event_title}
                          </button>`)}
                        ${dayEvents.length > 3 ? html`<span class="block px-1 text-xs text-ink-muted">+${dayEvents.length - 3} more</span>` : ''}
                      </div>
                    </div>`;
                })}
              </div>`}
        </section>
        ${view === 'month' ? html`<section class="mt-5 space-y-3" aria-labelledby="selected-day-title">
          <div class="flex items-center justify-between gap-3">
            <h2 id="selected-day-title" class="text-lg font-semibold">${selected.toFormat('cccc, LLLL d')}</h2>
            <button class="btn btn--secondary btn--sm" type="button" data-action="add">Add event</button>
          </div>
          ${selectedEvents.length
            ? selectedEvents.map((event) => html`
              <article class="card flex flex-wrap items-center gap-3 p-4">
                <div class="min-w-0 flex-1">
                  <h3 class="font-semibold">${event.event_title}</h3>
                  <p class="text-sm text-ink-muted">${formatReminderWhen(event)}</p>
                  ${event.event_description ? html`<p class="mt-1 whitespace-pre-line text-sm text-ink-muted">${event.event_description}</p>` : ''}
                  ${event.note ? html`<div class="mt-2 rounded-md bg-soft p-3 text-sm"><p class="font-medium">From note: ${event.note.title || 'Untitled note'}</p>${event.note.preview ? html`<p class="mt-1 line-clamp-3 whitespace-pre-line text-ink-muted">${event.note.preview}</p>` : ''}</div>` : ''}
                </div>
                ${event.note ? html`<a class="btn btn--ghost btn--sm" href="/notes/${event.note.id}" data-link>Open note</a>` : ''}
                <button class="btn btn--secondary btn--sm" type="button" data-action="edit" data-id="${event.id}">Edit</button>
                <button class="btn btn--danger-ghost btn--sm" type="button" data-action="delete" data-id="${event.id}">Delete</button>
              </article>`)
            : html`<p class="card p-4 text-sm text-ink-muted">No events on this day.</p>`}
        </section>` : ''}
      </div>`);
  }

  async function load() {
    error = '';
    try {
      const start = view === 'year' ? month.startOf('year') : month.startOf('month');
      const end = view === 'year' ? month.endOf('year') : month.endOf('month');
      events = await listReminders({
        from: start.setZone(timezone(), { keepLocalTime: true }).toUTC().toISO(),
        to: end.setZone(timezone(), { keepLocalTime: true }).toUTC().toISO(),
        limit: 200,
      });
    } catch (cause) {
      error = cause.message || 'Could not load calendar events.';
    }
    draw();
  }

  function movePeriod(direction) {
    month = view === 'year'
      ? month.plus({ years: direction })
      : month.plus({ months: direction });
    selectedDate = dateKey(month);
    load();
  }

  function addEvent() {
    openReminderSheet({
      mode: 'create',
      initial: {
        event_title: '',
        start_date: selectedDate,
        start_time: '09:00',
        timezone: timezone(),
      },
      defaultTimezone: timezone(),
      onSubmit: async (values, ui) => {
        try {
          await createReminder({
            ...values,
            note_id: null,
            source_text: null,
          });
          toast.success('Event added to your calendar');
          await load();
          return true;
        } catch (cause) {
          if (cause.code === 'validation_error' && Array.isArray(cause.details)) {
            ui.showFieldErrors(Object.fromEntries(cause.details.map((detail) => [detail.path, detail.message])));
          } else {
            ui.showError(cause.message);
          }
          return false;
        }
      },
    });
  }

  async function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, date, id } = target.dataset;
    if (action === 'previous') {
      movePeriod(-1);
      return;
    }
    if (action === 'next') {
      movePeriod(1);
      return;
    }
    if (action === 'choose-year') {
      view = 'year';
      await load();
      return;
    }
    if (action === 'select-month') {
      month = month.set({ month: Number(target.dataset.month) }).startOf('month');
      selectedDate = dateKey(month);
      view = 'month';
      await load();
      return;
    }
    if (action === 'today') {
      const today = DateTime.now().setZone(timezone());
      month = today.startOf('month');
      selectedDate = dateKey(today);
      view = 'month';
    }
    if (action === 'select-date' || action === 'select-event') {
      selectedDate = date;
      draw();
      return;
    }
    if (action === 'add') { addEvent(); return; }
    if (action === 'refresh') { await load(); return; }
    const reminder = events.find((item) => item.id === id);
    if (action === 'edit' && reminder) {
      editReminder(reminder, { onUpdated: load });
      return;
    }
    if (action === 'delete' && reminder) {
      await removeReminder(reminder, { onDeleted: load });
      return;
    }
    await load();
  }

  function onWheel(event) {
    if (!event.target.closest('[data-calendar-surface]') || Math.abs(event.deltaY) < 30) return;
    const now = Date.now();
    if (now - lastWheelAt < 400) return;
    event.preventDefault();
    lastWheelAt = now;
    movePeriod(event.deltaY > 0 ? 1 : -1);
  }

  main.addEventListener('click', onClick);
  main.addEventListener('wheel', onWheel, { passive: false });
  const onFocus = () => load();
  window.addEventListener('focus', onFocus);
  await load();
  return () => {
    main.removeEventListener('click', onClick);
    main.removeEventListener('wheel', onWheel);
    window.removeEventListener('focus', onFocus);
  };
}
