import { createElement, icon } from '../utils/helpers.js';
import { formatClock } from '../utils/date-utils.js';

/** Decorative iPhone-style status bar with a live clock. */
export function createStatusBar() {
  const element = createElement(`
    <div class="status-bar" aria-hidden="true">
      <span class="status-bar__time"></span>
      <span class="status-bar__notch"></span>
      <span class="status-bar__icons">
        ${icon('signal', { size: 17 })}
        ${icon('wifi', { size: 17 })}
        <svg class="icon" width="27" height="17" viewBox="0 0 28 24" aria-hidden="true" focusable="false"><use href="${new URL('../../assets/icons/icons.svg#icon-battery', import.meta.url).href}"></use></svg>
      </span>
    </div>
  `);
  const timeEl = element.querySelector('.status-bar__time');
  const tick = () => { timeEl.textContent = formatClock(new Date()); };
  tick();
  setInterval(tick, 15000);
  return element;
}
