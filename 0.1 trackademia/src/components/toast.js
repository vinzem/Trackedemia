/** Toast notifications with optional action (e.g. Undo, Retry, Open). */
import { html, mount } from '../utils/helpers.js';
import { icon } from './icons.js';

const ICONS = { success: 'checkCircle', error: 'alert', info: 'info', warning: 'alert' };

/**
 * @param {{ message:string, detail?:string, type?:'success'|'error'|'info'|'warning', duration?:number,
 *   actions?: Array<{ label:string, onClick?:Function, href?:string }> }} options
 * @returns {{ dismiss: Function }}
 */
export function showToast({ message, detail, type = 'info', duration = 5000, actions = [] }) {
  const region = document.getElementById('toast-region');
  if (!region) return { dismiss() {} };
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  mount(el, html`
    <span class="toast__icon mt-0.5">${icon(ICONS[type] || 'info')}</span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">${message}</p>
      ${detail ? html`<p class="mt-0.5 text-white/75">${detail}</p>` : ''}
    </div>
    <div class="flex shrink-0 items-center gap-1">
      ${actions.map((action, index) => (action.href
        ? html`<a class="toast__action" href="${action.href}" target="_blank" rel="noopener noreferrer" data-index="${index}">${action.label}</a>`
        : html`<button class="toast__action" type="button" data-index="${index}">${action.label}</button>`))}
      <button class="toast__action !no-underline" type="button" data-dismiss aria-label="Dismiss notification">${icon('close', { size: 16 })}</button>
    </div>`);

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.remove();
  };
  el.addEventListener('click', (event) => {
    if (event.target.closest('[data-dismiss]')) return dismiss();
    const target = event.target.closest('[data-index]');
    if (!target) return undefined;
    const action = actions[Number(target.dataset.index)];
    if (action?.onClick) {
      action.onClick();
      dismiss();
    }
    return undefined;
  });
  const arm = () => { if (duration > 0) timer = setTimeout(dismiss, duration); };
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', arm);
  el.addEventListener('focusin', () => clearTimeout(timer));
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  arm();
  return { dismiss, element: el };
}

export const toast = {
  success: (message, options = {}) => showToast({ ...options, message, type: 'success' }),
  error: (message, options = {}) => showToast({ duration: 8000, ...options, message, type: 'error' }),
  info: (message, options = {}) => showToast({ ...options, message, type: 'info' }),
  warning: (message, options = {}) => showToast({ ...options, message, type: 'warning' }),
};
