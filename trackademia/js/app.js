/**
 * Application bootstrap shared by every screen: storage mode, state restore,
 * device frame, annotations, and global listeners.
 */
import { initState, getState, setState, reloadState } from './state.js';
import { isOwnKey, useSandboxStorage } from './services/storage.js';
import { isEmbedded, buildUrl } from './router.js';
import { createStatusBar } from './components/status-bar.js';
import { ANNOTATIONS, initAnnotations, setAnnotationsVisible } from './components/annotation.js';
import { dismissTopSheet } from './components/bottom-sheet.js';
import { closeTopModal } from './components/modal.js';
import { showToast } from './components/toast.js';
import { createElement, escapeHtml, icon } from './utils/helpers.js';

export const ANNOTATION_MESSAGE = 'trackademia:annotations';

function createPrototypeBar(screenKey) {
  const meta = ANNOTATIONS[screenKey];
  return createElement(`
    <nav class="prototype-bar" aria-label="Prototype navigation">
      <a class="prototype-bar__link" href="${buildUrl('presentation')}">${icon('back', { size: 16 })}<span>All screens</span></a>
      <span class="prototype-bar__label">${meta ? `Screen ${meta.number} · ${escapeHtml(meta.title)}` : 'Trackademia'}</span>
    </nav>
  `);
}

/** Builds the 375 × 812 device and returns its content container. */
export function mountDeviceFrame(screenKey, { embedded = false } = {}) {
  const app = document.getElementById('app');
  app.replaceChildren();
  if (!embedded) app.appendChild(createPrototypeBar(screenKey));

  const device = createElement(`
    <div class="device" data-screen="${screenKey}">
      <div class="device__screen" data-screen-root>
        <div class="device__content" id="screen-content"></div>
        <div class="home-indicator" aria-hidden="true"><span></span></div>
      </div>
    </div>
  `);
  const screen = device.querySelector('.device__screen');
  screen.prepend(createStatusBar());
  app.appendChild(device);
  return device.querySelector('#screen-content');
}

let listenersRegistered = false;

function registerGlobalListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (closeTopModal()) return;
    dismissTopSheet();
  });

  // Keeps screens in sync when another tab or presentation frame changes the data.
  window.addEventListener('storage', (event) => {
    if (event.key && isOwnKey(event.key)) reloadState();
  });

  // Presentation page toggles annotations in every embedded frame.
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== ANNOTATION_MESSAGE) return;
    setState({ showAnnotations: Boolean(event.data.visible) });
    setAnnotationsVisible(Boolean(event.data.visible));
  });

  window.addEventListener('unhandledrejection', () => {
    showToast({ message: 'Something went wrong', detail: 'Please try that again.', variant: 'error' });
  });
}

/**
 * Starts a screen.
 * @param {string} screenKey key in ANNOTATIONS (e.g. 'home')
 * @param {(content: HTMLElement, context: {embedded: boolean}) => void} render
 */
export function bootstrapScreen(screenKey, render) {
  const embedded = isEmbedded();
  if (embedded) {
    useSandboxStorage();
    document.documentElement.classList.add('is-embedded');
  }
  initState();
  setState({ currentScreen: screenKey });

  const content = mountDeviceFrame(screenKey, { embedded });
  initAnnotations({ visible: getState().showAnnotations });
  registerGlobalListeners();
  render(content, { embedded });
}
