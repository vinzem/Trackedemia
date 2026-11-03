import { createIconButton } from './button.js';
import { markAnnotation } from './annotation.js';
import { createElement, escapeHtml, getInitials, icon } from '../utils/helpers.js';

function createAvatarButton({ user, onClick, annotation, label = 'Open profile' }) {
  const initials = getInitials(user?.name);
  const button = createElement(`
    <button type="button" class="avatar-btn" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${initials ? `<span>${escapeHtml(initials)}</span>` : icon('user', { size: 18 })}
    </button>
  `);
  if (onClick) button.addEventListener('click', onClick);
  if (annotation) markAnnotation(button, annotation, 'bottom-right');
  return button;
}

/**
 * Top navigation bar.
 * actions: [{ type: 'search'|'avatar'|'more'|'icon', label, onClick, annotation, icon, user, pressed }]
 */
export function createNavbar({
  title = '',
  wordmark = false,
  onBack = null,
  backLabel = 'Back',
  backAnnotation = null,
  actions = [],
} = {}) {
  const header = createElement(`
    <header class="navbar">
      <div class="navbar__start"></div>
      <div class="navbar__title"></div>
      <div class="navbar__end"></div>
    </header>
  `);
  const start = header.querySelector('.navbar__start');
  const titleEl = header.querySelector('.navbar__title');
  const end = header.querySelector('.navbar__end');

  if (onBack) {
    start.appendChild(createIconButton({ icon: 'back', label: backLabel, onClick: onBack, annotation: backAnnotation, placement: 'bottom-right' }));
  }

  if (wordmark) {
    header.classList.add('navbar--brand');
    start.appendChild(createElement(`
      <span class="wordmark">${icon('logo', { size: 22 })}<span>Trackademia</span></span>
    `));
  } else {
    titleEl.innerHTML = `<h1 class="navbar__heading">${escapeHtml(title)}</h1>`;
  }

  actions.forEach((action) => {
    if (action.type === 'avatar') {
      end.appendChild(createAvatarButton(action));
      return;
    }
    const iconName = action.icon || { search: 'search', more: 'more' }[action.type] || 'more';
    end.appendChild(createIconButton({
      icon: iconName,
      label: action.label || action.type,
      onClick: action.onClick,
      annotation: action.annotation,
      placement: 'bottom-right',
      pressed: action.pressed ?? null,
    }));
  });

  return header;
}
