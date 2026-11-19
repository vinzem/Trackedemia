/**
 * Reminder confirmation bottom sheet (Screen 04). Pure UI: it collects and
 * validates fields, then hands them to `onSubmit`, which performs the request.
 */
import { addMinutesToTime, todayISO } from '../utils/date-utils.js';
import { formValues, html } from '../utils/helpers.js';
import { listTimezones, offsetLabel } from '../utils/timezone.js';
import { validateReminderForm } from '../utils/validation.js';
import { setButtonLoading } from './button.js';
import { icon } from './icons.js';
import { field, showFieldErrors, textareaField } from './input.js';
import { openOverlay } from './modal.js';

/**
 * @param {{ mode:'create'|'edit', initial:object, clarification?:string|null, isPast?:boolean,
 *   defaultTimezone:string, onSubmit:(values:object, ui:object) => Promise<boolean>,
 *   onDismiss?:() => void, onClose?:() => void }} options
 */
export function openReminderSheet({ mode, initial, clarification, isPast, defaultTimezone, onSubmit, onDismiss, onClose }) {
  const timezone = initial.timezone || defaultTimezone;
  const zones = listTimezones();
  const allDay = Boolean(initial.all_day);
  let busy = false;

  const content = html`
    <div class="sheet__handle" aria-hidden="true"></div>
    <div class="flex items-center justify-between px-5 pb-2 pt-4">
      <h2 id="reminder-sheet-title" class="text-lg font-semibold">${mode === 'edit' ? 'Edit event' : 'Add calendar event'}</h2>
      <button class="icon-btn" type="button" data-sheet-action="cancel" aria-label="Close">${icon('close')}</button>
    </div>
    <form class="sheet__body space-y-4" novalidate>
      ${clarification ? html`<div class="alert alert--warning">${icon('info')}<p>${clarification}</p></div>` : ''}
      ${isPast ? html`<div class="alert alert--warning">${icon('clock')}<p>This time is in the past. Check the date before adding it.</p></div>` : ''}
      <div class="sheet-error alert alert--error" role="alert" hidden></div>
      ${field({ name: 'event_title', label: 'Event title', value: initial.event_title, maxlength: 200, required: true, autofocus: !initial.event_title })}
      ${textareaField({ name: 'event_description', label: 'Description (optional)', value: initial.event_description, rows: 2, maxlength: 5000 })}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        ${field({ name: 'start_date', label: 'Date', type: 'date', value: initial.start_date || '', min: mode === 'create' ? todayISO(timezone) : undefined, required: true })}
        <label class="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
          <input class="checkbox" type="checkbox" name="all_day"${allDay ? html` checked` : ''} /> All-day event
        </label>
      </div>
      <div class="grid grid-cols-2 gap-3" data-time-row${allDay ? html` hidden` : ''}>
        ${field({ name: 'start_time', label: 'Start time', type: 'time', value: initial.start_time || '', step: 300 })}
        ${field({ name: 'end_time', label: 'End time', type: 'time', value: initial.end_time || (initial.start_time ? addMinutesToTime(initial.start_time, 60) : ''), step: 300, hint: initial.end_time ? '' : 'Defaults to 1 hour' })}
      </div>
      <div class="field" data-field="timezone">
        <label class="field__label" for="sheet-timezone">Timezone</label>
        <select class="select" id="sheet-timezone" name="timezone">
          ${zones.map((zone) => html`<option value="${zone}"${zone === timezone ? html` selected` : ''}>${zone.replace(/_/g, ' ')} (${offsetLabel(zone)})</option>`)}
        </select>
        <p class="field__error" role="alert" hidden></p>
      </div>
      <div class="flex flex-col gap-2 pt-2">
        <button class="btn btn--primary btn--lg btn--block" type="submit" data-submit>
          ${icon(mode === 'edit' ? 'save' : 'calendarCheck')}<span>${mode === 'edit' ? 'Save changes' : 'Add event'}</span>
        </button>
        <div class="flex gap-2">
          ${mode === 'create' && onDismiss ? html`<button class="btn btn--ghost flex-1" type="button" data-sheet-action="dismiss">Dismiss suggestion</button>` : ''}
          <button class="btn btn--ghost flex-1" type="button" data-sheet-action="cancel">Cancel</button>
        </div>
      </div>
    </form>`;

  const sheet = openOverlay({ content, labelledBy: 'reminder-sheet-title', dismissible: () => !busy, onClose });
  const form = sheet.panel.querySelector('form');
  const errorBox = sheet.panel.querySelector('.sheet-error');
  const submitButton = sheet.panel.querySelector('[data-submit]');
  const timeRow = sheet.panel.querySelector('[data-time-row]');

  const showError = (message) => {
    errorBox.hidden = !message;
    errorBox.textContent = message || '';
  };

  form.elements.all_day.addEventListener('change', (event) => { timeRow.hidden = event.target.checked; });
  form.elements.start_time.addEventListener('change', (event) => {
    const end = form.elements.end_time;
    if (event.target.value && (!end.value || end.value <= event.target.value)) end.value = addMinutesToTime(event.target.value, 60);
  });

  sheet.panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-sheet-action]')?.dataset.sheetAction;
    if (!action || busy) return;
    if (action === 'cancel') sheet.close('cancel');
    if (action === 'dismiss') { onDismiss?.(); sheet.close('dismiss'); }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = formValues(form);
    values.event_title = values.event_title.trim();
    if (values.all_day) { values.start_time = null; values.end_time = null; }
    const { valid, errors } = validateReminderForm(values);
    showFieldErrors(form, errors);
    if (!valid) return;
    if (!values.end_time) values.end_time = null;

    busy = true;
    showError('');
    const restore = setButtonLoading(submitButton, mode === 'edit' ? 'Saving…' : 'Adding event…');
    try {
      const done = await onSubmit(values, {
        showError,
        showFieldErrors: (fieldErrors) => showFieldErrors(form, fieldErrors),
      });
      if (done) sheet.close('success');
    } finally {
      busy = false;
      if (document.body.contains(submitButton)) restore();
    }
  });

  return sheet;
}
