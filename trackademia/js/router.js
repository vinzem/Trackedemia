/**
 * Page-based router. Each screen is its own HTML file; this module builds
 * URLs between them and carries the `embed` flag used by the presentation grid.
 */
export const ROUTES = Object.freeze({
  presentation: 'index.html',
  onboarding: 'onboarding.html',
  notes: 'notes.html',
  newNote: 'new-note.html',
  confirmation: 'reminder-confirmation.html',
  success: 'calendar-success.html',
  detail: 'note-detail.html',
});

export function getParams() {
  return new URLSearchParams(window.location.search);
}

export function getParam(name) {
  return getParams().get(name);
}

/** Screens rendered inside the presentation grid run with ?embed=1. */
export function isEmbedded() {
  return getParam('embed') === '1';
}

export function buildUrl(route, params = {}, { embedded = isEmbedded() } = {}) {
  const file = ROUTES[route];
  if (!file) throw new Error(`Unknown route "${route}".`);
  const search = new URLSearchParams();
  if (embedded && route !== 'presentation') search.set('embed', '1');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `${file}?${query}` : file;
}

export function navigate(route, params = {}, { replace = false } = {}) {
  const url = buildUrl(route, params);
  if (replace) window.location.replace(url);
  else window.location.assign(url);
}

/** Explicit back navigation; browser history is unreliable inside iframes and fresh tabs. */
export function goBack(fallbackRoute = 'notes', params = {}) {
  navigate(fallbackRoute, params);
}
