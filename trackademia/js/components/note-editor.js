import { markAnnotation } from './annotation.js';
import { createElement, escapeHtml, generateId } from '../utils/helpers.js';

export const NOTE_PLACEHOLDER = "Type anything… e.g., 'Dentist appointment tomorrow at 10am'";

/** Escapes text and wraps each {start, end} range in a highlight mark. */
export function renderHighlightedText(text, ranges = []) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;
  sorted.forEach((range) => {
    if (range.start < cursor) return;
    html += escapeHtml(text.slice(cursor, range.start));
    html += `<mark class="detected-highlight">${escapeHtml(text.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  });
  return html + escapeHtml(text.slice(cursor));
}

/**
 * Note text area with inline highlighting. A mirrored backdrop renders the
 * highlights underneath a transparent textarea, so the text stays editable.
 */
export function createNoteEditor({
  value = '',
  placeholder = NOTE_PLACEHOLDER,
  label = 'Note text',
  readOnly = false,
  onInput = null,
  annotation = null,
} = {}) {
  const id = generateId('note-editor');
  const element = createElement(`
    <div class="note-editor ${readOnly ? 'note-editor--readonly' : ''}">
      <label class="sr-only" for="${id}">${escapeHtml(label)}</label>
      <div class="note-editor__surface">
        <div class="note-editor__backdrop" aria-hidden="${readOnly ? 'false' : 'true'}"></div>
        ${readOnly ? '' : `<textarea id="${id}" class="note-editor__input" spellcheck="true" placeholder="${escapeHtml(placeholder)}"></textarea>`}
      </div>
    </div>
  `);
  if (readOnly) element.querySelector('label').remove();

  const backdrop = element.querySelector('.note-editor__backdrop');
  const textarea = element.querySelector('textarea');
  let ranges = [];

  const paint = () => {
    const text = textarea ? textarea.value : value;
    // The trailing space keeps a final empty line the same height as the textarea's.
    backdrop.innerHTML = `${renderHighlightedText(text, ranges)} `;
  };

  if (textarea) {
    textarea.value = value;
    textarea.addEventListener('input', () => {
      paint();
      onInput?.(textarea.value);
    });
  }
  paint();
  if (annotation) markAnnotation(element, annotation, 'inside-top-right');

  return {
    element,
    textarea,
    getValue: () => (textarea ? textarea.value : value),
    setValue(next) {
      if (textarea) textarea.value = next;
      else value = next;
      paint();
    },
    setHighlights(nextRanges = []) {
      ranges = nextRanges;
      paint();
    },
    focus() {
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    },
  };
}
