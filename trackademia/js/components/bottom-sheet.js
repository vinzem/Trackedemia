import { createButton } from './button.js';
import { createElement, escapeHtml, getScreenRoot, generateId } from '../utils/helpers.js';

const openSheets = [];
const DRAG_DISMISS_DISTANCE = 96;
const TRANSITION_MS = 240;

/**
 * Opens a bottom sheet.
 * actions: [{ label, variant, icon, onClick(sheet, button), annotation, keepOpen }]
 * Returns { element, body, close, actionButtons }.
 */
export function openBottomSheet({
  title = '',
  description = '',
  content = null,
  actions = [],
  dismissible = true,
  onDismiss = null,
  host = getScreenRoot(),
  className = '',
} = {}) {
  const titleId = generateId('sheet-title');
  const overlay = createElement('<div class="sheet-overlay"></div>');
  const sheet = createElement(`
    <div class="sheet ${className}" role="dialog" aria-modal="true" ${title ? `aria-labelledby="${titleId}"` : ''}>
      <button type="button" class="sheet__handle" aria-label="${dismissible ? 'Drag down or press to dismiss' : 'Sheet handle'}"><span></span></button>
      ${title ? `<header class="sheet__header"><h2 class="sheet__title" id="${titleId}">${escapeHtml(title)}</h2>${description ? `<p class="sheet__description">${escapeHtml(description)}</p>` : ''}</header>` : ''}
      <div class="sheet__body"></div>
      <div class="sheet__actions"></div>
    </div>
  `);
  if (host === document.body) {
    overlay.classList.add('is-page-level');
    sheet.classList.add('is-page-level');
  }

  const body = sheet.querySelector('.sheet__body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);
  else body.remove();

  const previousFocus = document.activeElement;
  let closed = false;

  const api = {
    element: sheet,
    body,
    actionButtons: [],
    close(reason = 'action') {
      if (closed) return Promise.resolve();
      closed = true;
      const index = openSheets.indexOf(api);
      if (index !== -1) openSheets.splice(index, 1);
      sheet.classList.remove('is-open');
      overlay.classList.remove('is-open');
      sheet.style.transform = '';
      if (reason !== 'action' && onDismiss) onDismiss(reason);
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
      return new Promise((resolve) => {
        setTimeout(() => { overlay.remove(); sheet.remove(); resolve(); }, TRANSITION_MS);
      });
    },
    dismiss() {
      if (dismissible) api.close('dismiss');
    },
  };

  const actionsEl = sheet.querySelector('.sheet__actions');
  actions.forEach((action) => {
    const button = createButton({
      label: action.label,
      variant: action.variant || 'secondary',
      icon: action.icon,
      block: true,
      annotation: action.annotation,
      placement: action.placement || 'inside-right',
      onClick: async () => {
        if (action.onClick) await action.onClick(api, button);
        if (!action.keepOpen) api.close(action.dismiss ? 'dismiss' : 'action');
      },
    });
    api.actionButtons.push(button);
    actionsEl.appendChild(button);
  });
  if (!actions.length) actionsEl.remove();

  overlay.addEventListener('click', () => api.dismiss());
  enableDragToDismiss(sheet, api, dismissible);

  host.append(overlay, sheet);
  openSheets.push(api);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    sheet.classList.add('is-open');
    const focusTarget = sheet.querySelector('input, select, textarea, .sheet__actions button') || sheet.querySelector('button');
    focusTarget?.focus({ preventScroll: true });
  });
  return api;
}

function enableDragToDismiss(sheet, api, dismissible) {
  const handle = sheet.querySelector('.sheet__handle');
  let startY = null;
  let distance = 0;

  handle.addEventListener('click', () => { if (distance < 4) api.dismiss(); });
  handle.addEventListener('pointerdown', (event) => {
    startY = event.clientY;
    distance = 0;
    handle.setPointerCapture(event.pointerId);
    sheet.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', (event) => {
    if (startY === null) return;
    distance = Math.max(0, event.clientY - startY);
    sheet.style.transform = `translateY(${dismissible ? distance : Math.min(distance, 24)}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    sheet.classList.remove('is-dragging');
    if (dismissible && distance > DRAG_DISMISS_DISTANCE) api.close('drag');
    else sheet.style.transform = '';
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

export function dismissTopSheet() {
  const top = openSheets[openSheets.length - 1];
  if (!top) return false;
  top.dismiss();
  return true;
}

export function hasOpenSheet() {
  return openSheets.length > 0;
}
