/** Mobile top navigation bar. */
import { html } from '../utils/helpers.js';
import { icon, logo } from './icons.js';
import { avatar } from './sidebar.js';

export function navbar({ title, back, actions, user, profile } = {}) {
  return html`
    <header class="app-navbar" role="banner">
      ${back
        ? html`<a class="icon-btn" href="${back}" data-link aria-label="Back">${icon('back')}</a>`
        : html`<a class="flex items-center gap-2 px-2 font-bold no-underline" href="/notes" data-link aria-label="Trackademia home">${logo({ size: 28 })}<span>Trackademia</span></a>`}
      <h1 class="min-w-0 flex-1 truncate text-base font-semibold">${back ? title : ''}</h1>
      <div class="flex items-center gap-1">
        <a class="icon-btn" href="/calendar" data-link aria-label="Calendar">${icon('calendar')}</a>
        ${actions || ''}
        ${!back && user ? html`<a class="icon-btn" href="/settings" data-link aria-label="Account settings">${avatar(user, profile)}</a>` : ''}
      </div>
    </header>`;
}
