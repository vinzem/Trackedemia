/** Desktop sidebar navigation with calendar connection status. */
import { html, initials } from '../utils/helpers.js';
import { icon, logo } from './icons.js';

export function avatar(user, profile) {
  const name = profile?.display_name || user?.name || user?.email || '';
  return user?.avatarUrl
    ? html`<span class="avatar"><img src="${user.avatarUrl}" alt="" referrerpolicy="no-referrer" /></span>`
    : html`<span class="avatar" aria-hidden="true">${initials(name)}</span>`;
}

export function sidebar({ path, user, profile, calendar }) {
  const link = (href, label, iconName, matchPrefix) => {
    const active = matchPrefix ? path.startsWith(href) && path !== '/notes/new' : path === href;
    return html`<a class="nav-link" href="${href}" data-link${active ? html` aria-current="page"` : ''}>${icon(iconName)}<span>${label}</span></a>`;
  };
  const status = calendar?.connected
    ? html`<span class="badge badge--success">${icon('check', { size: 12 })}Connected</span>`
    : calendar?.needs_reconnect
      ? html`<span class="badge badge--warning">Reconnect</span>`
      : html`<span class="badge badge--neutral">Not connected</span>`;
  return html`
    <aside class="app-sidebar" aria-label="Primary">
      <a class="mb-6 flex items-center gap-2 px-2 text-lg font-bold no-underline" href="/notes" data-link>${logo()}<span>Trackademia</span></a>
      <a class="btn btn--primary btn--block mb-4" href="/notes/new" data-link>${icon('plus', { size: 18 })}<span>New note</span></a>
      <nav class="flex flex-col gap-1" aria-label="Main">
        ${link('/notes', 'All notes', 'note', true)}
        ${link('/settings', 'Settings', 'settings')}
      </nav>
      <div class="mt-auto space-y-3">
        <a class="card block p-3 text-sm no-underline" href="/settings#calendar" data-link>
          <span class="mb-1 flex items-center gap-2 font-semibold">${icon('calendar', { size: 18 })}Google Calendar</span>
          ${status}
        </a>
        <a class="flex items-center gap-3 rounded-md p-2 no-underline hover:bg-bg" href="/settings" data-link>
          ${avatar(user, profile)}
          <span class="min-w-0"><span class="block truncate text-sm font-semibold">${profile?.display_name || user?.name || 'Your account'}</span><span class="block truncate text-xs text-ink-muted">${user?.email || ''}</span></span>
        </a>
      </div>
    </aside>`;
}
