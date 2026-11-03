/**
 * Wireframe annotation markers.
 *
 * Elements opt in with `markAnnotation(el, n)`. Markers are drawn in a single
 * overlay layer so they never change the layout of the screen underneath.
 */
import { clamp, createElement, getScreenRoot } from '../utils/helpers.js';

export const ANNOTATION_GLYPHS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

/** Screen-specific annotation mapping, shared by the screens and the legend. */
export const ANNOTATIONS = Object.freeze({
  onboarding: {
    number: '01',
    title: 'Onboarding',
    items: [
      ['Continue with Google', 'Simulates Google sign-in and calendar connection, then opens Home.'],
      ['Sign up with Email', 'Opens a registration sheet (name and email) and creates a local account.'],
    ],
  },
  home: {
    number: '02',
    title: 'Home',
    items: [
      ['Search', 'Toggles the search field and filters notes by title, body, or reminder.'],
      ['Profile', 'Opens the profile sheet: account, calendar connection, annotations, sample data, sign out.'],
      ['Note card', 'Opens Note Detail for that note.'],
      ['Reminder badge', 'Shows the linked reminder’s day and time, or “Reminder detected” when one can be added.'],
      ['Create note FAB', 'Opens the New Note capture screen.'],
    ],
  },
  newNote: {
    number: '03',
    title: 'New Note',
    items: [
      ['Back', 'Returns to Home, asking before unsaved text is discarded.'],
      ['More options', 'Insert example text, clear the note, or delete it.'],
      ['Text editor', 'Free-form note input. Scheduling phrases are detected while you type.'],
      ['Date/time highlight', 'Detected text gets a yellow underline and a “Reminder detected” banner with Review.'],
      ['Microphone', 'Simulated dictation that types a sample sentence into the note.'],
      ['Attachment', 'Adds a placeholder photo or document to the note.'],
      ['Save', 'Saves the note. Opens Reminder Confirmation when a reminder is detected.'],
    ],
  },
  confirmation: {
    number: '04',
    title: 'Reminder Confirmation',
    items: [
      ['Event title', 'Editable, pre-filled from the words around the detected date.'],
      ['Date', 'Friendly label (“Tomorrow, Nov 4”) backed by the native date picker.'],
      ['Time', 'Friendly label (“10:00 AM”) backed by the native time picker.'],
      ['Calendar selector', 'Choose Personal, Work, or School.'],
      ['Add to Google Calendar', 'Validates the fields and creates a simulated calendar event.'],
      ['Dismiss', 'Closes the sheet and keeps the note without a reminder.'],
    ],
  },
  success: {
    number: '05',
    title: 'Calendar Success',
    items: [
      ['Success toast', 'Confirms the simulated event with its title, day, and time.'],
      ['Undo', 'Removes the reminder and its simulated calendar event.'],
      ['Back', 'Returns to Home.'],
      ['Note editor', 'The note stays editable, with the detected text still highlighted.'],
      ['Save', 'Saves any edits and opens Note Detail.'],
    ],
  },
  detail: {
    number: '06',
    title: 'Note Detail',
    items: [
      ['Back', 'Returns to Home.'],
      ['More options', 'Edit or delete the note.'],
      ['Edit Reminder', 'Opens an editable reminder form in a bottom sheet.'],
      ['Delete Reminder', 'Asks for confirmation, then removes the reminder (with undo).'],
      ['Open in Google Calendar', 'Simulates leaving the app for the event’s day in Google Calendar.'],
    ],
  },
});

export function glyph(number) {
  return ANNOTATION_GLYPHS[number - 1] || String(number);
}

const MARKER_RADIUS = 9;
const OFFSET = 4;

let root = null;
let layer = null;
let frame = 0;

export function markAnnotation(element, number, placement = 'top-right') {
  if (!element) return element;
  element.dataset.annotation = String(number);
  element.dataset.annotationPlacement = placement;
  scheduleAnnotationRefresh();
  return element;
}

function markerPosition(rect, rootRect, placement) {
  const left = rect.left - rootRect.left;
  const top = rect.top - rootRect.top;
  const right = left + rect.width;
  const bottom = top + rect.height;
  const midY = top + rect.height / 2;
  const positions = {
    'top-right': [right - OFFSET, top + OFFSET - MARKER_RADIUS],
    'top-left': [left + OFFSET, top + OFFSET - MARKER_RADIUS],
    'bottom-right': [right - OFFSET, bottom - OFFSET + MARKER_RADIUS],
    'bottom-left': [left + OFFSET, bottom - OFFSET + MARKER_RADIUS],
    left: [left - MARKER_RADIUS - 3, midY],
    right: [right + MARKER_RADIUS + 3, midY],
    'inside-right': [right - MARKER_RADIUS - 6, midY],
    'inside-top-right': [right - MARKER_RADIUS - 6, top + MARKER_RADIUS + 6],
  };
  return positions[placement] || positions['top-right'];
}

function isVisibleWithinClip(element, x, y, rootRect) {
  const clip = element.closest('[data-annotation-clip]');
  if (!clip) return true;
  const clipRect = clip.getBoundingClientRect();
  const absX = x + rootRect.left;
  const absY = y + rootRect.top;
  return absY >= clipRect.top - MARKER_RADIUS && absY <= clipRect.bottom + MARKER_RADIUS
    && absX >= clipRect.left - MARKER_RADIUS * 2 && absX <= clipRect.right + MARKER_RADIUS * 2;
}

export function refreshAnnotations() {
  frame = 0;
  if (!root || !layer) return;
  const rootRect = root.getBoundingClientRect();
  const markers = [];
  root.querySelectorAll('[data-annotation]').forEach((element) => {
    if (layer.contains(element) || element.closest('[hidden], [inert]')) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    let [x, y] = markerPosition(rect, rootRect, element.dataset.annotationPlacement);
    if (!isVisibleWithinClip(element, x, y, rootRect)) return;
    x = clamp(x, MARKER_RADIUS + 2, rootRect.width - MARKER_RADIUS - 2);
    y = clamp(y, MARKER_RADIUS + 2, rootRect.height - MARKER_RADIUS - 2);
    const marker = document.createElement('span');
    marker.className = 'annotation-marker';
    marker.textContent = element.dataset.annotation;
    marker.style.transform = `translate(${Math.round(x - MARKER_RADIUS)}px, ${Math.round(y - MARKER_RADIUS)}px)`;
    markers.push(marker);
  });
  layer.replaceChildren(...markers);
}

export function scheduleAnnotationRefresh() {
  if (frame || !layer) return;
  frame = requestAnimationFrame(refreshAnnotations);
}

export function setAnnotationsVisible(visible) {
  if (root) root.classList.toggle('annotations-hidden', !visible);
  if (visible) scheduleAnnotationRefresh();
}

/** Creates the marker layer and keeps it in sync with layout changes. */
export function initAnnotations({ visible = true } = {}) {
  root = getScreenRoot();
  layer = createElement('<div class="annotation-layer" aria-hidden="true"></div>');
  root.appendChild(layer);

  const observer = new MutationObserver((records) => {
    if (records.some((record) => !layer.contains(record.target))) scheduleAnnotationRefresh();
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  root.addEventListener('scroll', scheduleAnnotationRefresh, true);
  root.addEventListener('transitionend', scheduleAnnotationRefresh, true);
  root.addEventListener('animationend', scheduleAnnotationRefresh, true);
  root.addEventListener('input', scheduleAnnotationRefresh, true);
  window.addEventListener('resize', scheduleAnnotationRefresh);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleAnnotationRefresh).observe(root);

  setAnnotationsVisible(visible);
  scheduleAnnotationRefresh();
}
