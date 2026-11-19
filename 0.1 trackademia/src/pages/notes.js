/**
 * Screen 02: notes dashboard. Lists notes from the API with search, sorting,
 * reminder badges, refresh, and (on desktop) an upcoming-reminders panel.
 */
import { icon } from '../components/icons.js';
import { errorState, noteSkeletons } from '../components/loading.js';
import { listNotes } from '../features/notes/notes-service.js';
import { notesList, upcomingPanel } from '../features/notes/notes-ui.js';
import { listReminders } from '../features/reminders/reminder-service.js';
import { navigate } from '../router.js';
import { getState, setState } from '../state.js';
import { NOTE_SORTS } from '../utils/constants.js';
import { debounce, html, mount } from '../utils/helpers.js';

export async function render(ctx) {
  const { main, query } = ctx;
  ctx.setTitle('Notes');
  ctx.setFab(true);
  ctx.setNavbar({});

  let q = query.get('q') || getState().notesQuery.q || '';
  let sort = query.get('sort') || getState().notesQuery.sort || 'updated_desc';
  let controller = null;

  mount(main, html`
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Notes</h1>
          <p class="text-sm text-ink-muted" data-count aria-live="polite"></p>
        </div>
        <div class="hidden items-center gap-2 lg:flex">
          <a class="btn btn--primary" href="/notes/new" data-link>${icon('plus', { size: 18 })}<span>New note</span></a>
        </div>
      </header>
      <div class="mb-5 flex flex-col gap-2 sm:flex-row">
        <div class="relative flex-1">
          <label class="sr-only" for="notes-search">Search notes</label>
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">${icon('search', { size: 18 })}</span>
          <input class="input pl-10" id="notes-search" type="search" placeholder="Search notes" value="${q}" autocomplete="off" maxlength="200" />
        </div>
        <div class="flex gap-2">
          <label class="sr-only" for="notes-sort">Sort notes</label>
          <select class="select sm:w-48" id="notes-sort">
            ${NOTE_SORTS.map((option) => html`<option value="${option.value}"${option.value === sort ? html` selected` : ''}>${option.label}</option>`)}
          </select>
          <button class="icon-btn shrink-0 border border-line bg-surface" type="button" data-action="refresh" aria-label="Refresh notes">${icon('refresh', { size: 18 })}</button>
        </div>
      </div>
      <div class="notes-layout notes-layout--with-panel">
        <section data-list aria-label="Notes list" aria-busy="true">${noteSkeletons()}</section>
        <div class="hidden lg:block" data-panel></div>
      </div>
    </div>`);

  const listEl = main.querySelector('[data-list]');
  const countEl = main.querySelector('[data-count]');
  const panelEl = main.querySelector('[data-panel]');
  const searchEl = main.querySelector('#notes-search');

  async function load({ quiet = false } = {}) {
    controller?.abort();
    controller = new AbortController();
    if (!quiet) listEl.innerHTML = noteSkeletons().value;
    listEl.setAttribute('aria-busy', 'true');
    try {
      const { data, meta } = await listNotes({ q, sort, limit: 100 }, { signal: controller.signal });
      mount(listEl, notesList(data, { query: q }));
      countEl.textContent = q ? `${meta.total} result${meta.total === 1 ? '' : 's'} for “${q}”` : `${meta.total} note${meta.total === 1 ? '' : 's'}`;
    } catch (error) {
      if (error.name === 'AbortError') return;
      mount(listEl, errorState({ title: 'Could not load your notes', message: error.message }));
      countEl.textContent = '';
    } finally {
      listEl.setAttribute('aria-busy', 'false');
    }
  }

  async function loadPanel() {
    try {
      const reminders = await listReminders({ from: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), limit: 10 });
      mount(panelEl, upcomingPanel(reminders));
    } catch {
      panelEl.innerHTML = '';
    }
  }

  const syncUrl = () => {
    setState({ notesQuery: { q, sort } });
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort !== 'updated_desc') params.set('sort', sort);
    window.history.replaceState({}, '', `/notes${params.toString() ? `?${params}` : ''}`);
  };

  const onSearch = debounce(() => {
    q = searchEl.value.trim();
    syncUrl();
    load({ quiet: true });
  }, 250);

  const onChange = (event) => {
    if (event.target.id === 'notes-sort') {
      sort = event.target.value;
      syncUrl();
      load();
    }
  };
  const onClick = (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'refresh' || action === 'retry') { load(); loadPanel(); }
    if (action === 'clear-search') { searchEl.value = ''; q = ''; syncUrl(); load(); searchEl.focus(); }
  };
  const onKey = (event) => {
    if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      event.preventDefault();
      searchEl.focus();
    }
    if ((event.key === 'n' || event.key === 'N') && event.altKey) navigate('/notes/new');
  };
  const onFocus = () => load({ quiet: true });

  searchEl.addEventListener('input', onSearch);
  main.addEventListener('change', onChange);
  main.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  window.addEventListener('focus', onFocus);

  await Promise.all([load(), loadPanel()]);

  return () => {
    controller?.abort();
    onSearch.cancel();
    main.removeEventListener('change', onChange);
    main.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('focus', onFocus);
  };
}
