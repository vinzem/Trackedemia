import { markAnnotation } from './annotation.js';
import { createElement, escapeHtml, getScreenRoot, icon } from '../utils/helpers.js';

let current = null;

const VARIANT_ICONS = { success: 'check', info: 'sparkle', error: 'x' };

/**
 * Shows a single toast (replacing any visible one).
 * action: { label, onClick, annotation }
 * duration: milliseconds, or 0 to stay until dismissed.
 */
export function showToast({
  message,
  detail = '',
  variant = 'success',
  action = null,
  duration = 3200,
  annotation = null,
  position = 'bottom',
  host = getScreenRoot(),
} = {}) {
  if (current) current.dismiss({ immediate: true });

  const toast = createElement(`
    <div class="toast toast--${variant} toast--${position}" role="status" aria-live="polite">
      <span class="toast__icon">${icon(VARIANT_ICONS[variant] || 'check', { size: 16 })}</span>
      <div class="toast__text">
        <p class="toast__message">${escapeHtml(message)}</p>
        ${detail ? `<p class="toast__detail">${escapeHtml(detail)}</p>` : ''}
      </div>
      <div class="toast__actions"></div>
    </div>
  `);
  if (host === document.body) toast.classList.add('is-page-level');

  let timer = null;
  let removed = false;
  const api = {
    element: toast,
    dismiss({ immediate = false } = {}) {
      if (removed) return;
      removed = true;
      clearTimeout(timer);
      if (current === api) current = null;
      toast.classList.remove('is-visible');
      if (immediate) toast.remove();
      else setTimeout(() => toast.remove(), 220);
    },
  };

  const actionsEl = toast.querySelector('.toast__actions');
  if (action) {
    const actionButton = createElement(`<button type="button" class="toast__action">${icon('undo', { size: 14 })}<span>${escapeHtml(action.label)}</span></button>`);
    actionButton.addEventListener('click', () => {
      api.dismiss();
      action.onClick?.();
    });
    actionsEl.appendChild(actionButton);
    if (action.annotation) markAnnotation(actionButton, action.annotation, 'top-left');
  }
  const close = createElement(`<button type="button" class="toast__close" aria-label="Dismiss notification">${icon('x', { size: 14 })}</button>`);
  close.addEventListener('click', () => api.dismiss());
  actionsEl.appendChild(close);

  if (annotation) markAnnotation(toast, annotation, 'top-left');
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  if (duration > 0) timer = setTimeout(() => api.dismiss(), duration);
  current = api;
  return api;
}

export function dismissToast() {
  current?.dismiss();
}
