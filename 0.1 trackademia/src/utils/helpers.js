/** Small DOM + string helpers shared by every module. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (char) => ESCAPES[char]);
}

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Marks a string as trusted HTML (only for markup produced by our own templates). */
export const raw = (value) => new SafeHtml(String(value ?? ''));

function serialize(value) {
  if (value == null || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  return escapeHtml(value);
}

/** Tagged template that escapes every interpolation unless it is itself html``/raw(). */
export function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? serialize(values[i]) : ''), ''));
}

/** Renders an html`` result into an element. */
export function mount(element, template) {
  element.innerHTML = template instanceof SafeHtml ? template.value : escapeHtml(template);
  return element;
}

export function $(selector, root = document) { return root.querySelector(selector); }
export function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }

export function debounce(fn, wait) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  debounced.flush = (...args) => { clearTimeout(timer); return fn(...args); };
  return debounced;
}

export function initials(name = '') {
  const parts = String(name).trim().split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

export function truncate(text, length = 140) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length).replace(/\s+\S*$/, '')}…` : value;
}

/** Derives a note title from its first line when the user did not enter one. */
export function deriveTitle(content) {
  const line = String(content || '').split('\n').find((l) => l.trim()) || '';
  return truncate(line, 60) || 'Untitled note';
}

/** Collects named form controls into a plain object. */
export function formValues(form) {
  const values = {};
  [...form.elements].forEach((el) => {
    if (!el.name) return;
    values[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return values;
}

export function focusFirst(container) {
  const target = container.querySelector('[autofocus], input:not([type=hidden]), textarea, select, button');
  target?.focus();
}
