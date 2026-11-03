const ICON_SPRITE_URL = new URL('../../assets/icons/icons.svg', import.meta.url).href;

export function generateId(prefix = 'id') {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${time}${random}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns inline SVG markup that references a symbol in the shared sprite. */
export function icon(name, { size = 20, label = '', className = '' } = {}) {
  const a11y = label
    ? `role="img" aria-label="${escapeHtml(label)}"`
    : 'aria-hidden="true"';
  return `<svg class="icon ${className}" width="${size}" height="${size}" ${a11y} focusable="false"><use href="${ICON_SPRITE_URL}#icon-${name}"></use></svg>`;
}

export function createElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function debounce(fn, wait = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function toTitleCase(text = '') {
  const small = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  return String(text)
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function truncate(text = '', max = 80) {
  const value = String(text);
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** The element that hosts overlays (sheets, toasts, modals): the device screen, or the page body. */
export function getScreenRoot() {
  return document.querySelector('[data-screen-root]') || document.body;
}
