/** Loading, empty and error state blocks. */
import { html } from '../utils/helpers.js';
import { icon } from './icons.js';

export function spinner(label = 'Loading…') {
  return html`<div class="flex items-center justify-center gap-3 py-12 text-ink-muted" role="status"><span class="spinner text-primary" aria-hidden="true"></span><span>${label}</span></div>`;
}

export function noteSkeletons(count = 6) {
  return html`<div class="notes-grid" aria-hidden="true">${Array.from({ length: count }, () => html`
    <div class="card p-4"><div class="skeleton mb-3 h-5 w-2/3"></div><div class="skeleton mb-2 h-3.5 w-full"></div><div class="skeleton h-3.5 w-4/5"></div></div>`)}</div>
    <p class="sr-only" role="status">Loading notes…</p>`;
}

export function emptyState({ iconName = 'note', title, message, action }) {
  return html`
    <div class="card flex flex-col items-center px-6 py-12 text-center">
      <div class="mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">${icon(iconName, { size: 26 })}</div>
      <h2 class="text-lg font-semibold">${title}</h2>
      <p class="mt-1 max-w-sm text-sm text-ink-muted">${message}</p>
      ${action ? html`<div class="mt-5">${action}</div>` : ''}
    </div>`;
}

export function errorState({ title = 'Something went wrong', message, retryAction = 'retry' }) {
  return html`
    <div class="card flex flex-col items-center px-6 py-12 text-center" role="alert">
      <div class="mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">${icon('alert', { size: 26 })}</div>
      <h2 class="text-lg font-semibold">${title}</h2>
      <p class="mt-1 max-w-sm text-sm text-ink-muted">${message}</p>
      <button class="btn btn--secondary mt-5" type="button" data-action="${retryAction}">${icon('refresh', { size: 18 })}<span>Try again</span></button>
    </div>`;
}
