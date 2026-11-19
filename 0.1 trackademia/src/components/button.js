/** Button markup + loading-state helper shared across screens. */
import { html } from '../utils/helpers.js';
import { icon } from './icons.js';

/**
 * @param {{ label:string, variant?:'primary'|'secondary'|'ghost'|'danger'|'danger-ghost', size?:'sm'|'lg', block?:boolean,
 *   iconName?:string, type?:string, attrs?:string, href?:string, id?:string, disabled?:boolean }} options
 */
export function button({ label, variant = 'secondary', size, block, iconName, type = 'button', href, id, disabled, action, data = {} }) {
  const classes = ['btn', `btn--${variant}`, size && `btn--${size}`, block && 'btn--block'].filter(Boolean).join(' ');
  const dataAttrs = Object.entries({ action, ...data }).filter(([, v]) => v != null).map(([k, v]) => html` data-${k}="${v}"`);
  const inner = html`${iconName ? icon(iconName, { size: size === 'sm' ? 16 : 18 }) : ''}<span>${label}</span>`;
  if (href) {
    const external = /^https?:/.test(href);
    return html`<a class="${classes}" href="${href}" ${external ? html`target="_blank" rel="noopener noreferrer"` : html`data-link`}${id ? html` id="${id}"` : ''}${dataAttrs}>${inner}</a>`;
  }
  return html`<button class="${classes}" type="${type}"${id ? html` id="${id}"` : ''}${disabled ? html` disabled` : ''}${dataAttrs}>${inner}</button>`;
}

/** Puts a button into a loading state; returns a function that restores it. */
export function setButtonLoading(buttonEl, loadingLabel) {
  if (!buttonEl) return () => {};
  const original = buttonEl.innerHTML;
  const wasDisabled = buttonEl.disabled;
  buttonEl.disabled = true;
  buttonEl.classList.add('is-loading');
  buttonEl.setAttribute('aria-busy', 'true');
  buttonEl.innerHTML = `<span class="spinner h-4 w-4" aria-hidden="true"></span><span>${loadingLabel ? loadingLabel.replace(/</g, '&lt;') : buttonEl.textContent}</span>`;
  return () => {
    buttonEl.innerHTML = original;
    buttonEl.disabled = wasDisabled;
    buttonEl.classList.remove('is-loading');
    buttonEl.removeAttribute('aria-busy');
  };
}
