/**
 * Autosave controller for the note editor: debounced saves, manual save,
 * local draft backup, conflict detection and unsaved-change tracking.
 */
import { draftKey, storage } from '../../services/storage.js';
import { AUTOSAVE_DELAY_MS } from '../../utils/constants.js';
import { debounce } from '../../utils/helpers.js';
import { createNote, updateNote } from './notes-service.js';

/**
 * @param {{ note?: object, onStatus: (status:'idle'|'dirty'|'saving'|'saved'|'error'|'conflict', detail?:any) => void, onSaved: (note:object) => void }} options
 */
export function createNoteSession({ note = null, onStatus, onSaved }) {
  let saved = note ? { title: note.title, content: note.content } : { title: '', content: '' };
  let current = { ...saved };
  let record = note;
  let inFlight = null;
  let queued = false;

  const isDirty = () => current.title !== saved.title || current.content !== saved.content;
  const isEmpty = () => !current.title.trim() && !current.content.trim();

  async function save({ force = false } = {}) {
    if (!isDirty() && !force) return record;
    if (!record && isEmpty()) return null;
    if (inFlight) { queued = true; return inFlight; }
    const snapshot = { ...current };
    onStatus('saving');
    inFlight = (async () => {
      try {
        record = record
          ? await updateNote(record.id, { ...snapshot, expected_updated_at: record.updated_at })
          : await createNote(snapshot);
        saved = snapshot;
        storage.remove(draftKey(note?.id));
        storage.remove(draftKey(record.id));
        onSaved(record);
        onStatus(isDirty() ? 'dirty' : 'saved');
        return record;
      } catch (error) {
        storage.set(draftKey(record?.id || note?.id), { ...current, at: Date.now() });
        onStatus(error.status === 409 ? 'conflict' : 'error', error);
        throw error;
      } finally {
        inFlight = null;
        if (queued) { queued = false; queueMicrotask(() => save().catch(() => {})); }
      }
    })();
    return inFlight;
  }

  const autosave = debounce(() => save().catch(() => {}), AUTOSAVE_DELAY_MS);

  return {
    update(patch) {
      current = { ...current, ...patch };
      if (isDirty()) {
        onStatus('dirty');
        storage.set(draftKey(record?.id || note?.id), { ...current, at: Date.now() });
        autosave();
      }
    },
    save: () => { autosave.cancel(); return save({ force: !record }); },
    flush: () => { autosave.cancel(); return isDirty() ? save() : Promise.resolve(record); },
    /** Accepts the server copy after a conflict. */
    adopt(serverNote) { record = serverNote; saved = { title: serverNote.title, content: serverNote.content }; current = { ...saved }; },
    /** Overwrites the server copy with local text after a conflict. */
    async overwrite(serverNote) { record = serverNote; saved = { title: serverNote.title, content: serverNote.content }; return save({ force: true }); },
    get note() { return record; },
    get values() { return current; },
    isDirty,
    destroy() { autosave.cancel(); },
  };
}

export function readDraft(noteId) {
  return storage.get(draftKey(noteId));
}

export function discardDraft(noteId) {
  storage.remove(draftKey(noteId));
}
