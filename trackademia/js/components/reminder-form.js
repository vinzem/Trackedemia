import { markAnnotation } from './annotation.js';
import { createElement, escapeHtml, generateId, icon } from '../utils/helpers.js';
import { formatFriendlyDate, formatTime12 } from '../utils/date-utils.js';

/** Field showing a friendly value while delegating input to a native picker. */
function createPickerField({ id, label, type, value, display, iconName }) {
  const field = createElement(`
    <div class="field">
      <label class="field__label" for="${id}">${escapeHtml(label)}</label>
      <div class="picker-field">
        <span class="picker-field__icon">${icon(iconName, { size: 18 })}</span>
        <span class="picker-field__value">${escapeHtml(display)}</span>
        <input id="${id}" name="${type}" type="${type}" class="picker-field__input" value="${escapeHtml(value)}" required>
      </div>
      <p class="field__error" hidden></p>
    </div>
  `);
  const input = field.querySelector('input');
  input.addEventListener('click', () => {
    try { input.showPicker?.(); } catch { /* showPicker needs a user gesture in some browsers */ }
  });
  return field;
}

/**
 * Editable reminder fields (title, date, time, calendar).
 * annotations: { title, date, time, calendar } numbers for wireframe markers.
 */
export function createReminderForm(reminder, { calendars = [], annotations = {}, now = new Date() } = {}) {
  const prefix = generateId('reminder');
  const ids = { title: `${prefix}-title`, date: `${prefix}-date`, time: `${prefix}-time`, calendar: `${prefix}-calendar` };

  const form = createElement(`
    <form class="reminder-form" novalidate>
      <div class="field">
        <label class="field__label" for="${ids.title}">Event title</label>
        <input id="${ids.title}" name="title" class="input" type="text" maxlength="120" autocomplete="off" value="${escapeHtml(reminder.title)}" required>
        <p class="field__error" hidden></p>
      </div>
      <div class="field-row"></div>
      <div class="field">
        <label class="field__label" for="${ids.calendar}">Calendar</label>
        <div class="select-field">
          <span class="picker-field__icon">${icon('layers', { size: 18 })}</span>
          <select id="${ids.calendar}" name="calendar" class="select">
            ${calendars.map((name) => `<option value="${escapeHtml(name)}" ${name === reminder.calendar ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
          </select>
          ${icon('chevron-down', { size: 16, className: 'picker-field__chevron' })}
        </div>
        <p class="field__error" hidden></p>
      </div>
      <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
    </form>
  `);

  const row = form.querySelector('.field-row');
  const dateField = createPickerField({ id: ids.date, label: 'Date', type: 'date', value: reminder.date, display: formatFriendlyDate(reminder.date, now), iconName: 'calendar' });
  const timeField = createPickerField({ id: ids.time, label: 'Time', type: 'time', value: reminder.time, display: formatTime12(reminder.time), iconName: 'clock' });
  row.append(dateField, timeField);

  const inputs = {
    title: form.querySelector(`#${ids.title}`),
    date: dateField.querySelector('input'),
    time: timeField.querySelector('input'),
    calendar: form.querySelector(`#${ids.calendar}`),
  };

  inputs.date.addEventListener('change', () => {
    dateField.querySelector('.picker-field__value').textContent = formatFriendlyDate(inputs.date.value, now) || 'Choose a date';
  });
  inputs.time.addEventListener('change', () => {
    timeField.querySelector('.picker-field__value').textContent = formatTime12(inputs.time.value) || 'Choose a time';
  });
  Object.values(inputs).forEach((input) => input.addEventListener('input', () => showErrors({})));

  if (annotations.title) markAnnotation(inputs.title, annotations.title, 'inside-right');
  if (annotations.date) markAnnotation(dateField.querySelector('.picker-field'), annotations.date, 'top-right');
  if (annotations.time) markAnnotation(timeField.querySelector('.picker-field'), annotations.time, 'top-right');
  if (annotations.calendar) markAnnotation(form.querySelector('.select-field'), annotations.calendar, 'left');

  function showErrors(errors) {
    Object.entries(inputs).forEach(([key, input]) => {
      const errorEl = input.closest('.field').querySelector('.field__error');
      const message = errors[key];
      errorEl.hidden = !message;
      errorEl.textContent = message || '';
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (message) input.setAttribute('aria-describedby', `${input.id}-error`);
      errorEl.id = `${input.id}-error`;
    });
  }

  return {
    element: form,
    inputs,
    getValue: () => ({
      ...reminder,
      title: inputs.title.value.trim(),
      date: inputs.date.value,
      time: inputs.time.value,
      calendar: inputs.calendar.value,
    }),
    showErrors,
    onSubmit(handler) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
  };
}
