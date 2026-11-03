import { bootstrapScreen } from '../app.js';
import { buildUrl, navigate } from '../router.js';
import { consumeFlash, getState, setState, subscribe } from '../state.js';
import { clearAllNotes, getNotes, getNoteSnippet, restoreSampleNotes, selectNote } from '../features/notes.js';
import { detectReminder } from '../features/date-detection.js';
import { formatReminderSummary } from '../features/reminders.js';
import { connectCalendar, disconnectCalendar } from '../features/calendar-sync.js';
import { searchNotes, setSearchQuery, getSearchQuery } from '../features/search.js';
import { createNavbar } from '../components/navbar.js';
import { createNoteCard } from '../components/note-card.js';
import { createButton, setButtonLoading } from '../components/button.js';
import { markAnnotation, setAnnotationsVisible } from '../components/annotation.js';
import { openBottomSheet } from '../components/bottom-sheet.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { createElement, escapeHtml, getInitials, icon } from '../utils/helpers.js';
import { formatTimestamp } from '../utils/date-utils.js';

let searchOpen = false;
let elements = {};

function reminderBadge(note) {
  if (note.reminder) return { variant: 'linked', label: formatReminderSummary(note.reminder) };
  if (detectReminder(note.content).found) return { variant: 'detected', label: 'Reminder detected' };
  return null;
}

function renderEmptyState(container) {
  const empty = createElement(`
    <div class="empty-state">
      <svg class="empty-state__art" viewBox="0 0 160 120" aria-hidden="true">
        <rect x="30" y="14" width="100" height="92" rx="14" fill="#F0F0F0" stroke="#C7C7C7" stroke-width="2" stroke-dasharray="6 5"/>
        <rect x="48" y="36" width="52" height="7" rx="3.5" fill="#D4D4D4"/>
        <rect x="48" y="54" width="64" height="5" rx="2.5" fill="#E5E5E5"/>
        <rect x="48" y="68" width="40" height="5" rx="2.5" fill="#E5E5E5"/>
        <circle cx="122" cy="96" r="14" fill="#FFFFFF" stroke="#C7C7C7" stroke-width="2" stroke-dasharray="4 4"/>
        <path d="M122 90v12M116 96h12" stroke="#A3A3A3" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h2 class="empty-state__title">Nothing here yet</h2>
      <p class="empty-state__text">Create your first note to get started.</p>
    </div>
  `);
  empty.appendChild(createButton({
    label: 'Create Note',
    variant: 'primary',
    icon: 'plus',
    annotation: 5,
    placement: 'right',
    onClick: () => navigate('newNote'),
  }));
  container.appendChild(empty);
}

function renderNoResults(container, query) {
  const block = createElement(`
    <div class="empty-state empty-state--compact">
      <span class="empty-state__icon">${icon('search', { size: 22 })}</span>
      <h2 class="empty-state__title">No matches</h2>
      <p class="empty-state__text">No notes contain “${escapeHtml(query)}”.</p>
    </div>
  `);
  block.appendChild(createButton({ label: 'Clear search', variant: 'secondary', size: 'sm', onClick: () => updateSearch('') }));
  container.appendChild(block);
}

function renderList() {
  const allNotes = getNotes();
  const query = getSearchQuery();
  const notes = searchNotes(allNotes, query);
  const { list, count, fab } = elements;
  list.replaceChildren();

  count.textContent = query
    ? `${notes.length} of ${allNotes.length}`
    : `${allNotes.length} ${allNotes.length === 1 ? 'note' : 'notes'}`;
  fab.hidden = allNotes.length === 0;

  if (!allNotes.length) {
    renderEmptyState(list);
    return;
  }
  if (!notes.length) {
    renderNoResults(list, query);
    return;
  }

  let badgeAnnotated = false;
  notes.forEach((note, index) => {
    const badge = reminderBadge(note);
    const card = createNoteCard({
      title: note.title,
      snippet: getNoteSnippet(note),
      timestamp: formatTimestamp(note.updatedAt),
      href: buildUrl('detail', { id: note.id }),
      badge,
      annotations: { card: index === 0 ? 3 : null, badge: badge && !badgeAnnotated ? 4 : null },
      onOpen: () => selectNote(note.id),
    });
    if (badge) badgeAnnotated = true;
    list.appendChild(card);
  });
}

function updateSearch(query) {
  setSearchQuery(query);
  if (elements.searchInput.value !== query) elements.searchInput.value = query;
  if (!query && !searchOpen) elements.searchBar.hidden = true;
}

function toggleSearch() {
  searchOpen = elements.searchBar.hidden;
  elements.searchBar.hidden = !searchOpen;
  if (searchOpen) elements.searchInput.focus();
  else updateSearch('');
}

function openProfileSheet() {
  const { user, calendarConnected, connectedCalendar, showAnnotations } = getState();
  const content = createElement(`
    <div class="profile">
      <div class="profile__identity">
        <span class="avatar avatar--lg">${user ? escapeHtml(getInitials(user.name)) : icon('user', { size: 24 })}</span>
        <div>
          <p class="profile__name">${escapeHtml(user?.name || 'Guest')}</p>
          <p class="text-caption">${escapeHtml(user?.email || 'Not signed in')}</p>
        </div>
      </div>
      <div class="list-row">
        <span class="list-row__icon">${icon('calendar', { size: 18 })}</span>
        <div class="list-row__text">
          <p class="list-row__title">Google Calendar</p>
          <p class="text-caption">${calendarConnected ? `Connected · ${escapeHtml(connectedCalendar)} (simulated)` : 'Not connected'}</p>
        </div>
        <span data-slot="calendar"></span>
      </div>
      <label class="list-row list-row--toggle">
        <span class="list-row__icon">${icon('eye', { size: 18 })}</span>
        <span class="list-row__text"><span class="list-row__title">Show annotations</span></span>
        <input type="checkbox" class="switch" ${showAnnotations ? 'checked' : ''}>
      </label>
    </div>
  `);

  const calendarButton = createButton({
    label: calendarConnected ? 'Disconnect' : 'Connect',
    variant: 'secondary',
    size: 'sm',
    onClick: async () => {
      setButtonLoading(calendarButton, true, calendarConnected ? 'Disconnecting…' : 'Connecting…');
      const response = calendarConnected ? await disconnectCalendar() : await connectCalendar();
      sheet.close();
      showToast({
        message: calendarConnected ? 'Google Calendar disconnected' : 'Google Calendar connected',
        detail: 'Simulated connection — no Google account was contacted.',
        variant: response.ok ? 'success' : 'error',
      });
    },
  });
  content.querySelector('[data-slot="calendar"]').replaceWith(calendarButton);
  content.querySelector('.switch').addEventListener('change', (event) => {
    setState({ showAnnotations: event.target.checked });
    setAnnotationsVisible(event.target.checked);
  });

  const sheet = openBottomSheet({
    title: 'Profile',
    content,
    actions: [
      { label: 'Load sample notes', icon: 'refresh', onClick: () => { restoreSampleNotes(); showToast({ message: 'Sample notes restored' }); } },
      {
        label: 'Clear all notes',
        icon: 'trash',
        onClick: async () => {
          const confirmed = await openModal({ title: 'Clear all notes?', message: 'This removes every note and linked reminder from this browser.', confirmLabel: 'Clear notes', variant: 'danger' });
          if (confirmed) {
            clearAllNotes();
            showToast({ message: 'All notes cleared', variant: 'info' });
          }
        },
      },
      {
        label: user ? 'Sign out' : 'Sign in',
        icon: 'logout',
        variant: 'ghost',
        onClick: () => {
          if (user) setState({ user: null, calendarConnected: false });
          navigate('onboarding');
        },
      },
    ],
  });
}

function render(content) {
  const { user } = getState();
  const navbar = createNavbar({
    wordmark: true,
    actions: [
      { type: 'search', label: 'Search notes', onClick: toggleSearch, annotation: 1 },
      { type: 'avatar', user, label: 'Open profile', onClick: openProfileSheet, annotation: 2 },
    ],
  });

  const view = createElement(`
    <section class="screen">
      <div class="search-bar" hidden>
        <label class="search-field">
          ${icon('search', { size: 18 })}
          <span class="sr-only">Search notes</span>
          <input type="search" class="search-field__input" placeholder="Search notes" autocomplete="off">
        </label>
      </div>
      <div class="screen__scroll" data-annotation-clip>
        <div class="section-heading">
          <h2 class="heading-xl">My Notes</h2>
          <span class="text-caption" data-count></span>
        </div>
        <div class="note-list"></div>
      </div>
    </section>
  `);
  view.prepend(navbar);

  const fab = createElement(`<button type="button" class="fab" aria-label="Create note">${icon('plus', { size: 26 })}</button>`);
  fab.addEventListener('click', () => navigate('newNote'));
  markAnnotation(fab, 5, 'top-left');
  view.appendChild(fab);

  elements = {
    list: view.querySelector('.note-list'),
    count: view.querySelector('[data-count]'),
    searchBar: view.querySelector('.search-bar'),
    searchInput: view.querySelector('.search-field__input'),
    fab,
  };
  elements.searchInput.addEventListener('input', (event) => updateSearch(event.target.value));
  elements.searchInput.addEventListener('keydown', (event) => { if (event.key === 'Escape') toggleSearch(); });

  const query = getSearchQuery();
  if (query) {
    searchOpen = true;
    elements.searchBar.hidden = false;
    elements.searchInput.value = query;
  }

  content.appendChild(view);
  renderList();

  subscribe((_, changed) => {
    if (changed.includes('notes') || changed.includes('searchQuery')) renderList();
    if (changed.includes('user')) {
      const avatar = view.querySelector('.avatar-btn');
      const initials = getInitials(getState().user?.name);
      avatar.innerHTML = initials ? `<span>${escapeHtml(initials)}</span>` : icon('user', { size: 18 });
    }
  });

  const flash = consumeFlash();
  if (flash) showToast({ message: flash.message, detail: flash.detail, variant: flash.variant || 'success' });
}

bootstrapScreen('home', render);
