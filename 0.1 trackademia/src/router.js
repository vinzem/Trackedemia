/**
 * History-API router with auth guards and leave-confirmation hooks.
 * Links opt in with `data-link`; everything else behaves normally.
 */
const routes = [];
let current = null;
let leaveGuard = null;
let guard = () => null;
let onRender = () => {};

export function defineRoute(pattern, loader, { auth = true, layout = 'app' } = {}) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })}\\/?$`);
  routes.push({ pattern, regex, keys, loader, auth, layout });
}

export function match(pathname) {
  for (const route of routes) {
    const found = pathname.match(route.regex);
    if (found) {
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(found[i + 1])]));
      return { route, params };
    }
  }
  return null;
}

/** `fn(route) => redirectPath | null` decides access before rendering. */
export function setGuard(fn) { guard = fn; }
export function setRenderer(fn) { onRender = fn; }

/** Pages with unsaved work register a guard: return a message to confirm leaving. */
export function setLeaveGuard(fn) { leaveGuard = fn; }

export async function navigate(path, { replace = false, force = false } = {}) {
  const target = new URL(path, window.location.origin);
  if (!force && leaveGuard) {
    const allowed = await leaveGuard(target);
    if (!allowed) return false;
  }
  leaveGuard = null;
  if (replace) window.history.replaceState({}, '', target.pathname + target.search + target.hash);
  else window.history.pushState({}, '', target.pathname + target.search + target.hash);
  await resolve();
  return true;
}

export function currentRoute() { return current; }

export async function resolve() {
  const { pathname, search } = window.location;
  const found = match(pathname) || match('/404');
  const redirect = guard(found?.route, pathname);
  if (redirect && redirect !== pathname) {
    window.history.replaceState({}, '', redirect);
    return resolve();
  }
  current = { ...found, path: pathname, query: new URLSearchParams(search) };
  await onRender(current);
}

export function startRouter() {
  window.addEventListener('popstate', async () => {
    if (leaveGuard) {
      const allowed = await leaveGuard(new URL(window.location.href));
      if (!allowed) {
        window.history.pushState({}, '', current.path + (current.query.toString() ? `?${current.query}` : ''));
        return;
      }
      leaveGuard = null;
    }
    resolve();
  });
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-link]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || link.target === '_blank') return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
  return resolve();
}
