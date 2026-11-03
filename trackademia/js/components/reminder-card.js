import { createElement, escapeHtml, icon } from '../utils/helpers.js';

/**
 * Displays a reminder. All values arrive pre-formatted so the card stays presentational.
 */
export function createReminderCard({
  label = 'Linked Reminder',
  title,
  dateLabel,
  timeLabel,
  calendar,
  statusLabel,
  linked = true,
  actions = [],
}) {
  const card = createElement(`
    <section class="reminder-card ${linked ? '' : 'reminder-card--empty'}" aria-label="${escapeHtml(label)}">
      <div class="reminder-card__head">
        <span class="reminder-card__icon">${icon('calendar', { size: 20 })}</span>
        <div class="reminder-card__heading">
          <div class="reminder-card__label-row">
            <span class="reminder-card__label">${escapeHtml(label)}</span>
            ${statusLabel ? `<span class="status-pill ${linked ? 'status-pill--success' : ''}">${linked ? icon('check', { size: 12 }) : ''}${escapeHtml(statusLabel)}</span>` : ''}
          </div>
          <h3 class="reminder-card__title">${escapeHtml(title)}</h3>
        </div>
      </div>
      ${linked ? `
        <dl class="reminder-card__details">
          <div><dt>${icon('calendar', { size: 16 })}<span>Date</span></dt><dd>${escapeHtml(dateLabel)}</dd></div>
          <div><dt>${icon('clock', { size: 16 })}<span>Time</span></dt><dd>${escapeHtml(timeLabel)}</dd></div>
          <div><dt>${icon('layers', { size: 16 })}<span>Calendar</span></dt><dd>${escapeHtml(calendar)}</dd></div>
        </dl>` : ''}
      <div class="reminder-card__actions"></div>
    </section>
  `);
  const actionsEl = card.querySelector('.reminder-card__actions');
  if (actions.length) actions.forEach((action) => actionsEl.appendChild(action));
  else actionsEl.remove();
  return card;
}
