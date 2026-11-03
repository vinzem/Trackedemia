import { createButton } from './button.js';
import { createElement, escapeHtml, generateId, getScreenRoot } from '../utils/helpers.js';

const openModals = [];

/**
 * Confirmation dialog. Resolves true on confirm, false on cancel/dismiss.
 * variant: 'primary' | 'danger'
 */
export function openModal({
  title,
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  icon: iconName = null,
  host = getScreenRoot(),
} = {}) {
  return new Promise((resolve) => {
    const titleId = generateId('modal-title');
    const overlay = createElement(`
      <div class="modal-overlay">
        <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}">
          <h2 class="modal__title" id="${titleId}">${escapeHtml(title)}</h2>
          ${message ? `<p class="modal__message">${escapeHtml(message)}</p>` : ''}
          <div class="modal__actions"></div>
        </div>
      </div>
    `);
    if (host === document.body) overlay.classList.add('is-page-level');
    const dialog = overlay.querySelector('.modal');
    const previousFocus = document.activeElement;
    let settled = false;

    const entry = {
      close(result) {
        if (settled) return;
        settled = true;
        openModals.splice(openModals.indexOf(entry), 1);
        overlay.classList.remove('is-open');
        setTimeout(() => overlay.remove(), 180);
        if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
        resolve(result);
      },
    };

    const actions = overlay.querySelector('.modal__actions');
    const cancel = createButton({ label: cancelLabel, variant: 'ghost', block: true, onClick: () => entry.close(false) });
    const confirm = createButton({
      label: confirmLabel,
      variant: variant === 'danger' ? 'danger' : 'primary',
      icon: iconName,
      block: true,
      onClick: () => entry.close(true),
    });
    actions.append(cancel, confirm);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) entry.close(false); });

    host.appendChild(overlay);
    openModals.push(entry);
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      (variant === 'danger' ? cancel : confirm).focus({ preventScroll: true });
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusables = [cancel, confirm];
      const index = focusables.indexOf(document.activeElement);
      event.preventDefault();
      focusables[(index + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
    });
  });
}

export function closeTopModal() {
  const top = openModals[openModals.length - 1];
  if (!top) return false;
  top.close(false);
  return true;
}
