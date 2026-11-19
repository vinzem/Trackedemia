/** Inline highlighting of detected date/time phrases. */
import { escapeHtml, html, raw } from '../../utils/helpers.js';

/** Classifies an event for highlight styling. */
export function eventTone(event, reminders = []) {
  if (reminders.some((r) => r.source_text && event.source_text && r.source_text === event.source_text)) return 'is-synced';
  if (event.is_past) return 'is-past';
  if (event.missing_fields?.length) return 'is-partial';
  return '';
}

/** Builds highlighted HTML for `text` (all user text escaped). */
export function highlightHtml(text, events, reminders = []) {
  const ranges = events
    .flatMap((event, index) => (event.ranges?.length ? event.ranges : event.range ? [event.range] : []).map((range) => ({ ...range, index, tone: eventTone(event, reminders) })))
    .filter((r) => r.start >= 0 && r.end <= text.length && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start < cursor) return;
    out += escapeHtml(text.slice(cursor, range.start));
    out += `<mark class="${range.tone}" data-event-index="${range.index}">${escapeHtml(text.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  });
  out += escapeHtml(text.slice(cursor));
  // A trailing newline needs a placeholder so the backdrop keeps the same height as the textarea.
  return raw(`${out}${text.endsWith('\n') ? ' ' : ''}`);
}

/** Keeps the backdrop aligned with the textarea as it scrolls/resizes. */
export function bindBackdrop(textarea, backdrop) {
  const sync = () => {
    backdrop.scrollTop = textarea.scrollTop;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, window.innerHeight * 0.5)}px`;
  };
  textarea.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  sync();
  return { sync, destroy: () => window.removeEventListener('resize', sync) };
}

export function renderHighlights(backdrop, text, events, reminders) {
  backdrop.innerHTML = highlightHtml(text, events, reminders).value;
}

/** Read-only highlighted rendering for the note detail view. */
export function highlightedPreview(text, events, reminders) {
  return html`<div class="preview whitespace-pre-wrap break-words text-[17px] leading-relaxed">${highlightHtml(text, events, reminders)}</div>`;
}
