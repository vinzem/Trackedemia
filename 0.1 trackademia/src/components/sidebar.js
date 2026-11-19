/** Desktop sidebar navigation. */
import { html, initials } from '../utils/helpers.js';
import { icon, logo } from './icons.js';
import { getTheme } from '../services/theme.js';

export function avatar(user, profile) {
  const name = profile?.display_name || user?.name || user?.email || '';
  return user?.avatarUrl
    ? html`<span class="avatar"><img src="${user.avatarUrl}" alt="" referrerpolicy="no-referrer" /></span>`
    : html`<span class="avatar" aria-hidden="true">${initials(name)}</span>`;
}

export function sidebar({ path, user, profile }) {
  const theme = getTheme();
  const link = (href, label, iconName, matchPrefix) => {
    const active = matchPrefix ? path.startsWith(href) && path !== '/notes/new' : path === href;
    return html`<a class="nav-link" href="${href}" data-link${active ? html` aria-current="page"` : ''}>${icon(iconName)}<span>${label}</span></a>`;
  };
  return html`
    <aside class="app-sidebar" aria-label="Primary">
      <div class="mb-6 flex items-center justify-between gap-2 px-2">
        <a class="flex min-w-0 items-center gap-2 text-lg font-bold no-underline" href="/notes" data-link>${logo()}<span>Trackademia</span></a>
        <button class="icon-btn h-9 w-9 shrink-0" type="button" data-action="toggle-theme" aria-label="${theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}" title="${theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}">${icon(theme === 'dark' ? 'sun' : 'moon', { size: 18 })}</button>
      </div>
      <a class="btn btn--primary btn--block mb-4" href="/notes/new" data-link>${icon('plus', { size: 18 })}<span>New note</span></a>
      <nav class="flex flex-col gap-1" aria-label="Main">
        ${link('/notes', 'All notes', 'note', true)}
        ${link('/calendar', 'Calendar', 'calendar')}
        ${link('/settings', 'Settings', 'settings')}
      </nav>
      <div class="mt-auto space-y-3">
        <a class="flex items-center gap-3 rounded-md p-2 no-underline hover:bg-bg" href="/settings" data-link>
          ${avatar(user, profile)}
          <span class="min-w-0"><span class="block truncate text-sm font-semibold">${profile?.display_name || user?.name || 'Your account'}</span><span class="block truncate text-xs text-ink-muted">${user?.email || ''}</span></span>
        </a>
      </div>
    </aside>`;
}
