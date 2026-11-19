/**
 * Application shell: route table, auth guards, responsive layout (sidebar on
 * desktop, top bar + FAB on mobile) and page lifecycle management.
 */
import { icon } from './components/icons.js';
import { navbar } from './components/navbar.js';
import { sidebar } from './components/sidebar.js';
import { toast } from './components/toast.js';
import { initAuth, isAuthenticated, rememberRedirect } from './features/auth/auth-controller.js';
import { defineRoute, navigate, setGuard, setLeaveGuard, setRenderer, startRouter } from './router.js';
import { initializeTheme, toggleTheme } from './services/theme.js';
import { getState, subscribe } from './state.js';
import { html, mount } from './utils/helpers.js';

const PUBLIC_ONLY = new Set(['/onboarding']);

defineRoute('/', null, { auth: false });
defineRoute('/onboarding', () => import('./pages/onboarding.js'), { auth: false, layout: 'auth' });
defineRoute('/auth/callback', () => import('./pages/onboarding.js'), { auth: false, layout: 'auth' });
defineRoute('/reset-password', () => import('./pages/onboarding.js'), { auth: false, layout: 'auth' });
defineRoute('/notes', () => import('./pages/notes.js'));
defineRoute('/calendar', () => import('./pages/calendar.js'));
defineRoute('/notes/new', () => import('./pages/new-note.js'));
defineRoute('/notes/:id/edit', () => import('./pages/new-note.js'));
defineRoute('/notes/:id', () => import('./pages/note-detail.js'));
defineRoute('/settings', () => import('./pages/settings.js'));
defineRoute('/404', null, { auth: false });

let cleanup = null;
let shellState = { navbar: {}, fab: false, path: '' };
let renderToken = 0;

function guard(route, path) {
  if (!route) return '/404';
  if (path === '/') return isAuthenticated() ? '/notes' : '/onboarding';
  if (route.auth && !isAuthenticated()) {
    rememberRedirect(path + window.location.search);
    return '/onboarding';
  }
  if (PUBLIC_ONLY.has(path) && isAuthenticated()) return '/notes';
  return null;
}

function renderShellChrome() {
  const { user, profile } = getState();
  const sidebarEl = document.getElementById('app-sidebar-slot');
  const navbarEl = document.getElementById('app-navbar-slot');
  const fabEl = document.getElementById('app-fab-slot');
  if (sidebarEl) mount(sidebarEl, sidebar({ path: shellState.path, user, profile }));
  if (navbarEl) mount(navbarEl, navbar({ ...shellState.navbar, user, profile }));
  if (fabEl) mount(fabEl, shellState.fab ? html`<a class="fab" href="/notes/new" data-link aria-label="New note">${icon('plus', { size: 26 })}</a>` : '');
}

function ensureShell(layout) {
  const root = document.getElementById('app');
  if (layout === 'auth') {
    root.dataset.layout = 'auth';
    root.innerHTML = '<main id="main" tabindex="-1"></main>';
    return root.querySelector('main');
  }
  if (root.dataset.layout !== 'app') {
    root.dataset.layout = 'app';
    mount(root, html`
      <div class="app-shell">
        <div id="app-sidebar-slot" class="contents"></div>
        <div class="min-w-0">
          <div id="app-navbar-slot"></div>
          <main id="main" class="app-main" tabindex="-1"></main>
        </div>
      </div>
      <div id="app-fab-slot"></div>`);
  }
  return root.querySelector('main');
}

function notFound(main) {
  mount(main, html`<div class="page page--narrow"><div class="card p-8 text-center"><h1 class="text-xl font-semibold">Page not found</h1><p class="mt-2 text-ink-muted">That page does not exist.</p><a class="btn btn--primary mt-5" href="/notes" data-link>Go to notes</a></div></div>`);
}

async function render(match) {
  const token = (renderToken += 1);
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  setLeaveGuard(null);

  const { route, params, path, query } = match;
  const main = ensureShell(route?.layout || 'app');
  shellState = { navbar: {}, fab: false, path };

  if (!route?.loader) {
    renderShellChrome();
    notFound(main);
    return;
  }
  if (route.layout !== 'auth') {
    renderShellChrome();
  }

  const page = await route.loader();
  if (token !== renderToken) return;
  const ctx = {
    main,
    params,
    query,
    path,
    setNavbar(options) { shellState.navbar = options; renderShellChrome(); },
    setFab(show) { shellState.fab = show; renderShellChrome(); },
    setTitle(title) { document.title = title ? `${title} · Trackademia` : 'Trackademia'; },
  };
  ctx.setTitle('');
  cleanup = await page.render(ctx);
  if (token === renderToken) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

export async function startApp() {
  initializeTheme();
  await initAuth({
    onSignedOut: () => navigate('/onboarding', { replace: true, force: true }),
    onSignedIn: (redirect) => {
      const path = window.location.pathname;
      if (redirect) navigate(redirect, { replace: true, force: true });
      else if (path === '/onboarding' || path === '/auth/callback' || path === '/') navigate('/notes', { replace: true, force: true });
    },
    onExpired: () => {
      toast.warning('Your session expired', { detail: 'Please sign in again. Unsaved text is kept on this device.' });
      rememberRedirect(window.location.pathname);
      navigate('/onboarding', { replace: true, force: true });
    },
  });

  subscribe(() => {
    if (document.getElementById('app')?.dataset.layout === 'app') renderShellChrome();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action=toggle-theme]')) return;
    toggleTheme();
    renderShellChrome();
  });
  window.addEventListener('online', () => toast.success('Back online'));
  window.addEventListener('offline', () => toast.warning('You are offline', { detail: 'Changes are kept on this device until you reconnect.' }));

  setGuard(guard);
  setRenderer(render);
  await startRouter();
}
