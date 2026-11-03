import { markAnnotation } from './annotation.js';
import { createElement, escapeHtml, icon } from '../utils/helpers.js';

/**
 * Clickable note summary.
 * badge: { variant: 'linked'|'detected', label } or null
 */
export function createNoteCard({ title, snippet, timestamp, href, badge = null, annotations = {}, onOpen = null }) {
  const card = createElement(`
    <a class="note-card" href="${escapeHtml(href)}">
      <div class="note-card__header">
        <h3 class="note-card__title">${escapeHtml(title)}</h3>
        <time class="note-card__time">${escapeHtml(timestamp)}</time>
      </div>
      <p class="note-card__snippet">${escapeHtml(snippet) || '<span class="text-muted">No additional text</span>'}</p>
    </a>
  `);

  if (badge) {
    const badgeEl = createElement(`
      <span class="badge badge--${badge.variant}">
        ${icon(badge.variant === 'linked' ? 'calendar' : 'sparkle', { size: 14 })}
        <span>${escapeHtml(badge.label)}</span>
      </span>
    `);
    card.appendChild(badgeEl);
    if (annotations.badge) markAnnotation(badgeEl, annotations.badge, 'right');
  }

  if (annotations.card) markAnnotation(card, annotations.card, 'top-right');
  if (onOpen) card.addEventListener('click', onOpen);
  return card;
}
