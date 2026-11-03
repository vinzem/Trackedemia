import { markAnnotation } from './annotation.js';
import { escapeHtml, icon } from '../utils/helpers.js';

/**
 * @param {object} options
 * @param {'primary'|'secondary'|'ghost'|'danger'|'link'} [options.variant]
 */
export function createButton({
  label,
  variant = 'secondary',
  size = 'md',
  icon: iconName = null,
  onClick = null,
  ariaLabel = '',
  type = 'button',
  block = false,
  disabled = false,
  annotation = null,
  placement = 'top-right',
  className = '',
} = {}) {
  const button = document.createElement('button');
  button.type = type;
  button.className = ['btn', `btn--${variant}`, `btn--${size}`, block ? 'btn--block' : '', className].filter(Boolean).join(' ');
  button.innerHTML = `${iconName ? icon(iconName, { size: size === 'sm' ? 16 : 18 }) : ''}<span class="btn__label">${escapeHtml(label)}</span>`;
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  button.disabled = disabled;
  if (onClick) button.addEventListener('click', onClick);
  if (annotation) markAnnotation(button, annotation, placement);
  return button;
}

export function createIconButton({
  icon: iconName,
  label,
  onClick = null,
  annotation = null,
  placement = 'top-right',
  className = '',
  size = 22,
  pressed = null,
} = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-btn ${className}`.trim();
  button.setAttribute('aria-label', label);
  button.title = label;
  if (pressed !== null) button.setAttribute('aria-pressed', String(pressed));
  button.innerHTML = icon(iconName, { size });
  if (onClick) button.addEventListener('click', onClick);
  if (annotation) markAnnotation(button, annotation, placement);
  return button;
}

/** Shows a busy label while an async action runs. */
export function setButtonLoading(button, loading, loadingLabel = 'Working…') {
  const labelEl = button.querySelector('.btn__label');
  if (loading) {
    if (labelEl && !button.dataset.idleLabel) button.dataset.idleLabel = labelEl.textContent;
    if (labelEl) labelEl.textContent = loadingLabel;
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  } else {
    if (labelEl && button.dataset.idleLabel) labelEl.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
  }
}
