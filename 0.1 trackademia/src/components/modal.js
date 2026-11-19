/**
 * Accessible overlay primitive used for dialogs and bottom sheets:
 * focus trap, Escape to close, scroll lock and focus restoration.
 */
import { html, mount } from '../utils/helpers.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {{ content: object, variant?: 'sheet'|'dialog', labelledBy?: string, onClose?: Function, dismissible?: () => boolean }} options
 */
export function openOverlay({ content, variant = 'sheet', labelledBy, onClose, dismissible = () => true }) {
  const root = document.getElementById('overlay-root') || document.body;
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = variant;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (labelledBy) panel.setAttribute('aria-labelledby', labelledBy);
  mount(panel, content);
  overlay.append(panel);
  root.append(overlay);
  document.body.style.overflow = 'hidden';

  let closed = false;
  function close(reason = 'close') {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (!root.querySelector('.overlay')) document.body.style.overflow = '';
    if (previous instanceof HTMLElement) previous.focus();
    onClose?.(reason);
  }

  function onKey(event) {
    if (event.key === 'Escape' && dismissible()) {
      event.stopPropagation();
      close('escape');
    }
    if (event.key === 'Tab') {
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay && dismissible()) close('backdrop');
  });
  requestAnimationFrame(() => (panel.querySelector('[autofocus]') || panel.querySelector(FOCUSABLE))?.focus());
  return { panel, close };
}

/** Promise-based confirmation dialog for destructive actions. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, secondaryLabel }) {
  return new Promise((resolve) => {
    let answered = false;
    const { panel, close } = openOverlay({
      variant: 'dialog',
      labelledBy: 'confirm-title',
      content: html`
        <h2 id="confirm-title" class="text-lg font-semibold">${title}</h2>
        <p class="mt-2 text-sm text-ink-muted">${message}</p>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button class="btn btn--ghost" type="button" data-answer="cancel">${cancelLabel}</button>
          ${secondaryLabel ? html`<button class="btn btn--secondary" type="button" data-answer="secondary">${secondaryLabel}</button>` : ''}
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-answer="confirm" autofocus>${confirmLabel}</button>
        </div>`,
      onClose: () => { if (!answered) resolve('cancel'); },
    });
    panel.addEventListener('click', (event) => {
      const target = event.target.closest('[data-answer]');
      if (!target) return;
      answered = true;
      resolve(target.dataset.answer);
      close();
    });
  });
}
