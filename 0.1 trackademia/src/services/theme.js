/** Per-device light/dark theme preference. */
import { storage } from './storage.js';

const THEME_KEY = 'theme';

export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function initializeTheme() {
  const theme = storage.get(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function toggleTheme() {
  const theme = getTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  storage.set(THEME_KEY, theme);
  return theme;
}
