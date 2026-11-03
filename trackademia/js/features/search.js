import { getState, setState } from '../state.js';

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function searchableText(note) {
  return normalize([note.title, note.content, note.reminder?.title, note.reminder?.calendar].join(' '));
}

/** Notes containing every word of the query (title, body, or reminder). */
export function searchNotes(notes, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return notes;
  return notes.filter((note) => {
    const haystack = searchableText(note);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function getSearchQuery() {
  return getState().searchQuery || '';
}

export function setSearchQuery(query) {
  setState({ searchQuery: query });
}

export function clearSearch() {
  setState({ searchQuery: '' });
}
