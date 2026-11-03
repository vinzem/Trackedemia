/**
 * Presentation page: all six screens in a responsive grid of live, embedded
 * frames, plus the annotation legend.
 */
import { ANNOTATION_MESSAGE } from '../app.js';
import { buildUrl } from '../router.js';
import { getState, initState, setState } from '../state.js';
import { clearAppData, resetSandbox } from '../services/storage.js';
import { ANNOTATIONS, glyph } from '../components/annotation.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { createElement, escapeHtml, icon } from '../utils/helpers.js';

const DEVICE_WIDTH = 375;

const SCREENS = [
  { key: 'onboarding', route: 'onboarding', params: {}, title: 'Onboarding / Sign-in', summary: 'Sign in with Google (simulated) or email.' },
  { key: 'home', route: 'notes', params: {}, title: 'Home / Notes List', summary: 'Searchable notes with reminder badges.' },
  { key: 'newNote', route: 'newNote', params: { demo: 1 }, title: 'New Note / Capture', summary: 'Dates and times are detected while typing.' },
  { key: 'confirmation', route: 'confirmation', params: { demo: 1 }, title: 'Reminder Confirmation', summary: 'Review and edit the suggested reminder.' },
  { key: 'success', route: 'success', params: {}, title: 'Calendar Sync Success', summary: 'Confirmation toast with undo.' },
  { key: 'detail', route: 'detail', params: { id: 'note-001' }, title: 'Note Detail / Manage Reminder', summary: 'Edit, delete, or open the linked reminder.' },
];

const frames = [];

function frameUrl(screen) {
  return buildUrl(screen.route, screen.params, { embedded: true });
}

function renderGrid(container) {
  SCREENS.forEach((screen) => {
    const meta = ANNOTATIONS[screen.key];
    const card = createElement(`
      <article class="screen-card">
        <header class="screen-card__header">
          <p class="screen-card__eyebrow">Screen ${meta.number}</p>
          <h3 class="screen-card__title">${escapeHtml(screen.title)}</h3>
          <p class="screen-card__summary">${escapeHtml(screen.summary)}</p>
        </header>
        <div class="frame-viewport">
          <iframe class="frame-viewport__frame" title="Screen ${meta.number}: ${escapeHtml(screen.title)}" width="375" height="812"></iframe>
        </div>
        <a class="screen-card__link" href="${buildUrl(screen.route, screen.params, { embedded: false })}">
          Open ${escapeHtml(buildUrl(screen.route, {}, { embedded: false }))} ${icon('external', { size: 14 })}
        </a>
      </article>
    `);
    const iframe = card.querySelector('iframe');
    iframe.src = frameUrl(screen);
    frames.push({ iframe, screen });
    container.appendChild(card);
  });

  const resize = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const scale = Math.min(1, entry.contentRect.width / DEVICE_WIDTH);
      entry.target.style.setProperty('--frame-scale', scale.toFixed(4));
    });
  });
  container.querySelectorAll('.frame-viewport').forEach((viewport) => resize.observe(viewport));
}

function renderLegend(container) {
  SCREENS.forEach((screen) => {
    const meta = ANNOTATIONS[screen.key];
    container.appendChild(createElement(`
      <section class="legend-group">
        <h3 class="legend-group__title">Screen ${meta.number} — ${escapeHtml(meta.title)}</h3>
        <ol class="legend-list">
          ${meta.items.map(([name, description], index) => `
            <li class="legend-list__item">
              <span class="legend-list__marker" aria-hidden="true">${glyph(index + 1)}</span>
              <span><strong>${escapeHtml(name)}</strong> — ${escapeHtml(description)}</span>
            </li>`).join('')}
        </ol>
      </section>
    `));
  });
}

function broadcastAnnotations(visible) {
  frames.forEach(({ iframe }) => {
    iframe.contentWindow?.postMessage({ type: ANNOTATION_MESSAGE, visible }, window.location.origin);
  });
}

function reloadFrames() {
  frames.forEach(({ iframe, screen }) => { iframe.src = frameUrl(screen); });
}

function bindControls() {
  const toggle = document.getElementById('toggle-annotations');
  toggle.checked = getState().showAnnotations;
  toggle.addEventListener('change', () => {
    setState({ showAnnotations: toggle.checked });
    broadcastAnnotations(toggle.checked);
  });

  document.getElementById('reset-frames').addEventListener('click', () => {
    resetSandbox({ showAnnotations: toggle.checked });
    reloadFrames();
    showToast({ message: 'Wireframes restarted', detail: 'Embedded screens are back to sample data.', host: document.body });
  });

  document.getElementById('reset-app').addEventListener('click', async () => {
    const confirmed = await openModal({
      title: 'Reset app data?',
      message: 'Clears notes, reminders, and sign-in stored by the standalone pages in this browser.',
      confirmLabel: 'Reset data',
      variant: 'danger',
      host: document.body,
    });
    if (!confirmed) return;
    clearAppData();
    initState();
    setState({ showAnnotations: toggle.checked });
    showToast({ message: 'App data reset', detail: 'Sample notes return on the next visit.', variant: 'info', host: document.body });
  });
}

initState();
resetSandbox({ showAnnotations: getState().showAnnotations });
renderGrid(document.getElementById('screen-grid'));
renderLegend(document.getElementById('legend'));
bindControls();
