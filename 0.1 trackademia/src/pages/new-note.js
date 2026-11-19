/**
 * Screen 03 (capture / edit) with Screen 05 (sync success) inline.
 * Autosaving editor with live date/time detection, inline highlighting,
 * reminder review, dictation and attachments.
 */
import { setButtonLoading } from '../components/button.js';
import { icon } from '../components/icons.js';
import { errorState, spinner } from '../components/loading.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { confirmDetectedEvent, undoReminder } from '../features/reminders/reminder-controller.js';
import { detectionChips, syncSuccessPanel } from '../features/reminders/reminder-ui.js';
import { createDetectionController } from '../features/detection/detection-controller.js';
import { bindBackdrop, renderHighlights } from '../features/detection/highlighting.js';
import { createNoteSession, discardDraft, readDraft } from '../features/notes/notes-controller.js';
import { getNote } from '../features/notes/notes-service.js';
import { listAttachments, removeAttachment, uploadAttachment, attachmentUrl } from '../features/notes/attachments-service.js';
import { navigate, setLeaveGuard } from '../router.js';
import { storage } from '../services/storage.js';
import { getState } from '../state.js';
import { UNDO_WINDOW_MS } from '../utils/constants.js';
import { formatRelative } from '../utils/date-utils.js';
import { html, mount } from '../utils/helpers.js';
import { detectTimezone } from '../utils/timezone.js';

const STATUS_TEXT = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved, kept on this device',
  conflict: 'Edited elsewhere',
};

const dismissedKey = (id) => `dismissed:${id || 'new'}`;

function editorTemplate(note) {
  return html`
    <div class="page page--narrow flex min-h-[calc(100vh-56px)] flex-col lg:min-h-screen">
      <div class="mb-3 hidden items-center justify-between lg:flex">
        <a class="btn btn--ghost btn--sm -ml-3" href="${note ? `/notes/${note.id}` : '/notes'}" data-link data-back>${icon('back', { size: 16 })}<span>${note ? 'Back to note' : 'All notes'}</span></a>
        <span class="text-sm text-ink-muted" data-status-desktop aria-hidden="true"></span>
      </div>
      <div data-banner></div>
      <label class="sr-only" for="note-title">Title</label>
      <input id="note-title" class="w-full border-0 bg-transparent p-0 text-2xl font-bold tracking-tight outline-none placeholder:text-ink-faint" placeholder="Title" maxlength="200" autocomplete="off" value="${note?.title || ''}" />
      <div class="mt-3 flex min-h-[28px] flex-wrap items-center gap-2" data-detection-indicator></div>
      <div class="mt-3" data-success></div>
      <div class="editor mt-2 flex-1">
        <div class="editor__backdrop" aria-hidden="true" data-backdrop></div>
        <label class="sr-only" for="note-content">Note</label>
        <textarea id="note-content" class="editor__input" spellcheck="true" placeholder="Start writing… try “Submit thesis draft next Monday at 3pm”" maxlength="50000" ${note ? '' : html`autofocus`}>${note?.content || ''}</textarea>
      </div>
      <div class="mb-2 space-y-1" data-attachments></div>
      <div class="editor-toolbar" role="toolbar" aria-label="Note tools">
        <button class="icon-btn" type="button" data-action="dictate" aria-pressed="false" aria-label="Dictate with microphone">${icon('mic')}</button>
        <button class="icon-btn" type="button" data-action="attach" aria-label="Attach a file">${icon('paperclip')}</button>
        <input type="file" class="sr-only" tabindex="-1" data-file-input aria-hidden="true" />
        <button class="icon-btn" type="button" data-action="detect" aria-label="Review detected reminders">${icon('bell')}</button>
        <span class="ml-auto mr-2 text-xs text-ink-muted" data-status role="status" aria-live="polite"></span>
        <button class="btn btn--primary btn--sm" type="button" data-action="save">${icon('check', { size: 16 })}<span>Save</span></button>
      </div>
    </div>`;
}

export async function render(ctx) {
  const { main, params } = ctx;
  const editing = Boolean(params.id);
  ctx.setNavbar({ title: editing ? 'Edit note' : 'New note', back: editing ? `/notes/${params.id}` : '/notes' });
  ctx.setTitle(editing ? 'Edit note' : 'New note');

  let note = null;
  if (editing) {
    mount(main, spinner('Loading note…'));
    try {
      note = await getNote(params.id);
    } catch (error) {
      mount(main, errorState({ title: error.status === 404 ? 'Note not found' : 'Could not open this note', message: error.message }));
      const retry = (event) => { if (event.target.closest('[data-action=retry]')) navigate(window.location.pathname, { replace: true, force: true }); };
      main.addEventListener('click', retry);
      return () => main.removeEventListener('click', retry);
    }
  }

  mount(main, editorTemplate(note));
  const titleEl = main.querySelector('#note-title');
  const contentEl = main.querySelector('#note-content');
  const backdropEl = main.querySelector('[data-backdrop]');
  const indicatorEl = main.querySelector('[data-detection-indicator]');
  const successEl = main.querySelector('[data-success]');
  const statusEl = main.querySelector('[data-status]');
  const statusDesktopEl = main.querySelector('[data-status-desktop]');
  const bannerEl = main.querySelector('[data-banner]');
  const attachmentsEl = main.querySelector('[data-attachments]');
  const fileInput = main.querySelector('[data-file-input]');
  const backdrop = bindBackdrop(contentEl, backdropEl);

  let reminders = note?.reminders || [];
  let detection = { events: [] };
  let detectionPending = false;
  let dismissed = new Set(storage.get(dismissedKey(note?.id), []));
  let undoTimer = null;
  let recognition = null;

  const timezone = () => getState().profile?.timezone || detectTimezone();
  const visibleEvents = () => detection.events.filter((event) => !dismissed.has(event.source_text));

  function setStatus(status, error) {
    const label = STATUS_TEXT[status] ?? '';
    statusEl.textContent = status === 'saved' && session.note ? `Saved ${formatRelative(session.note.updated_at)}` : label;
    statusDesktopEl.textContent = statusEl.textContent;
    statusEl.classList.toggle('text-danger', status === 'error' || status === 'conflict');
    if (status === 'conflict') showConflict(error?.details?.current);
    if (status === 'error' && error?.code !== 'network_error') toast.error('Could not save note', { detail: error?.message });
  }

  const session = createNoteSession({
    note,
    onStatus: setStatus,
    onSaved: (saved) => {
      note = saved;
      if (!editing && window.location.pathname === '/notes/new') {
        // Keep the editor open but give it a stable URL once the note exists.
        window.history.replaceState({}, '', `/notes/${saved.id}/edit`);
        const back = main.querySelector('[data-back]');
        back.setAttribute('href', `/notes/${saved.id}`);
        back.querySelector('span').textContent = 'Back to note';
        ctx.setNavbar({ title: 'Edit note', back: `/notes/${saved.id}` });
        const old = storage.get(dismissedKey(null), []);
        if (old.length) { storage.set(dismissedKey(saved.id), old); storage.remove(dismissedKey(null)); }
        loadAttachments();
      }
    },
  });

  function drawDetection() {
    const events = visibleEvents();
    renderHighlights(backdropEl, contentEl.value, events, reminders);
    const count = events.filter((e) => !e.is_past && !reminders.some((r) => r.source_text === e.source_text)).length;
    mount(indicatorEl, html`
      ${count ? html`<span class="badge badge--primary" aria-live="polite">${icon('sparkles', { size: 12 })}${count} reminder${count === 1 ? '' : 's'} detected</span>` : ''}
      ${detectionChips(events, { pending: detectionPending, synced: reminders })}`);
    main.querySelector('[data-action=detect]').setAttribute('aria-label', count ? `Review ${count} detected reminder${count === 1 ? '' : 's'}` : 'No reminders detected');
  }

  const detector = createDetectionController({
    timezone,
    noteId: () => session.note?.id || null,
    aiEnabled: () => getState().profile?.ai_detection_enabled !== false,
    onResult: (result, meta) => {
      if (meta.text !== contentEl.value) return;
      detection = result;
      detectionPending = meta.pending;
      drawDetection();
    },
  });

  function showConflict(current) {
    mount(bannerEl, html`
      <div class="alert alert--warning mb-4" role="alert">
        ${icon('alert')}
        <div class="flex-1">
          <p class="font-semibold">This note changed on another device.</p>
          <p class="text-ink-muted">Choose which version to keep.</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button class="btn btn--secondary btn--sm" type="button" data-action="conflict-theirs">Load the other version</button>
            <button class="btn btn--primary btn--sm" type="button" data-action="conflict-mine">Keep my changes</button>
          </div>
        </div>
      </div>`);
    bannerEl.dataset.current = JSON.stringify(current || null);
  }

  function offerDraftRestore() {
    const draft = readDraft(note?.id || null);
    if (!draft || (draft.title === (note?.title || '') && draft.content === (note?.content || ''))) return;
    if (note && draft.at < new Date(note.updated_at).getTime() - 1000) { discardDraft(note.id); return; }
    mount(bannerEl, html`
      <div class="alert alert--info mb-4">
        ${icon('info')}
        <div class="flex-1">
          <p class="font-semibold">You have unsaved changes from ${formatRelative(new Date(draft.at).toISOString())}.</p>
          <div class="mt-2 flex gap-2">
            <button class="btn btn--primary btn--sm" type="button" data-action="restore-draft">Restore</button>
            <button class="btn btn--ghost btn--sm" type="button" data-action="discard-draft">Discard</button>
          </div>
        </div>
      </div>`);
  }

  function onInput() {
    session.update({ title: titleEl.value, content: contentEl.value });
    backdrop.sync();
    renderHighlights(backdropEl, contentEl.value, [], reminders); // clear stale marks immediately
    detector.analyze(contentEl.value);
  }

  async function ensureNote() {
    const saved = await session.save();
    if (!saved) throw new Error('Write something in the note first.');
    return saved;
  }

  function showSuccess(reminder) {
    clearTimeout(undoTimer);
    mount(successEl, syncSuccessPanel(reminder));
    successEl.querySelector('[data-action=undo-reminder]')?.focus();
    undoTimer = setTimeout(() => {
      const undo = successEl.querySelector('[data-action=undo-reminder]');
      if (undo) undo.remove();
    }, UNDO_WINDOW_MS * 3);
  }

  async function review(index) {
    const event = visibleEvents()[index];
    if (!event || reminders.some((r) => r.source_text && r.source_text === event.source_text)) return;
    await confirmDetectedEvent({
      event,
      ensureNote,
      onDismiss: () => {
        dismissed.add(event.source_text);
        storage.set(dismissedKey(session.note?.id), [...dismissed]);
        drawDetection();
      },
      onCreated: (reminder, meta = {}) => {
        reminders = [...reminders.filter((r) => r.id !== reminder.id), reminder];
        drawDetection();
        if (meta.duplicate && !meta.retried) return;
        showSuccess(reminder);
        toast.success('Added to Google Calendar', {
          detail: reminder.event_title,
          duration: UNDO_WINDOW_MS,
          actions: [
            { label: 'Undo', onClick: () => undo(reminder) },
            ...(reminder.google_event_link ? [{ label: 'Open', href: reminder.google_event_link }] : []),
          ],
        });
      },
    });
  }

  function undo(reminder) {
    undoReminder(reminder, {
      onUndone: () => {
        reminders = reminders.filter((r) => r.id !== reminder.id);
        if (successEl.querySelector(`[data-success-reminder="${reminder.id}"]`)) successEl.innerHTML = '';
        drawDetection();
      },
    });
  }

  async function loadAttachments() {
    const id = session.note?.id;
    const user = getState().user;
    if (!id || !user) { attachmentsEl.innerHTML = ''; return; }
    try {
      const files = await listAttachments(user.id, id);
      mount(attachmentsEl, html`${files.map((file) => html`
        <div class="flex items-center gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm">
          ${icon('file', { size: 16 })}
          <button class="min-w-0 flex-1 truncate text-left font-medium text-primary" type="button" data-action="open-attachment" data-path="${file.path}">${file.name}</button>
          <span class="text-xs text-ink-muted">${Math.max(1, Math.round(file.size / 1024))} KB</span>
          <button class="icon-btn h-8 w-8" type="button" data-action="remove-attachment" data-path="${file.path}" aria-label="Remove ${file.name}">${icon('close', { size: 16 })}</button>
        </div>`)}`);
    } catch {
      attachmentsEl.innerHTML = '';
    }
  }

  function toggleDictation(buttonEl) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info('Dictation is not supported in this browser', { detail: 'Try Chrome, Edge or Safari, or use your keyboard’s microphone key.' });
      return;
    }
    if (recognition) { recognition.stop(); return; }
    recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const transcript = [...event.results].slice(event.resultIndex).filter((r) => r.isFinal).map((r) => r[0].transcript).join(' ').trim();
      if (!transcript) return;
      const { selectionStart: start, selectionEnd: end, value } = contentEl;
      const spacer = start > 0 && !/\s$/.test(value.slice(0, start)) ? ' ' : '';
      contentEl.setRangeText(`${spacer}${transcript}`, start, end, 'end');
      onInput();
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') toast.error('Microphone access was blocked', { detail: 'Allow microphone access in your browser settings to dictate.' });
    };
    recognition.onend = () => {
      recognition = null;
      buttonEl.setAttribute('aria-pressed', 'false');
      buttonEl.classList.remove('icon-btn--recording');
    };
    recognition.start();
    buttonEl.setAttribute('aria-pressed', 'true');
    buttonEl.classList.add('icon-btn--recording');
    contentEl.focus();
  }

  async function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action } = target.dataset;
    if (action === 'save') {
      const restore = setButtonLoading(target, 'Saving…');
      try {
        const saved = await session.save();
        if (saved) toast.success('Note saved');
      } catch { /* status shows the error */ } finally { restore(); }
    } else if (action === 'review-event') {
      review(Number(target.dataset.index));
    } else if (action === 'detect') {
      await detector.analyzeNow(contentEl.value);
      const events = visibleEvents().filter((e) => !reminders.some((r) => r.source_text === e.source_text));
      if (events.length) review(visibleEvents().indexOf(events[0]));
      else toast.info('No dates or times found', { detail: 'Try writing something like “Quiz on Friday at 9am”.' });
    } else if (action === 'undo-reminder') {
      const reminder = reminders.find((r) => r.id === target.dataset.id);
      if (reminder) undo(reminder);
    } else if (action === 'close-success') {
      successEl.innerHTML = '';
    } else if (action === 'dictate') {
      toggleDictation(target);
    } else if (action === 'attach') {
      try { await ensureNote(); fileInput.click(); } catch (error) { toast.info('Write something first', { detail: error.message }); }
    } else if (action === 'open-attachment') {
      try { window.open(await attachmentUrl(target.dataset.path), '_blank', 'noopener'); } catch (error) { toast.error('Could not open file', { detail: error.message }); }
    } else if (action === 'remove-attachment') {
      if (await confirmDialog({ title: 'Remove attachment?', message: 'The file will be deleted.', confirmLabel: 'Remove', danger: true }) !== 'confirm') return;
      try { await removeAttachment(target.dataset.path); loadAttachments(); } catch (error) { toast.error('Could not remove file', { detail: error.message }); }
    } else if (action === 'restore-draft') {
      const draft = readDraft(note?.id || null);
      titleEl.value = draft.title;
      contentEl.value = draft.content;
      bannerEl.innerHTML = '';
      onInput();
    } else if (action === 'discard-draft') {
      discardDraft(note?.id || null);
      bannerEl.innerHTML = '';
    } else if (action === 'conflict-theirs') {
      const current = JSON.parse(bannerEl.dataset.current || 'null') || await getNote(session.note.id);
      session.adopt(current);
      titleEl.value = current.title;
      contentEl.value = current.content;
      bannerEl.innerHTML = '';
      setStatus('saved');
      onInput();
    } else if (action === 'conflict-mine') {
      const current = JSON.parse(bannerEl.dataset.current || 'null') || await getNote(session.note.id);
      bannerEl.innerHTML = '';
      session.overwrite(current).catch(() => {});
    }
  }

  async function onFile() {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const id = session.note?.id;
    const toastRef = toast.info(`Uploading ${file.name}…`, { duration: 0 });
    try {
      await uploadAttachment(getState().user.id, id, file);
      toastRef.dismiss();
      toast.success('File attached', { detail: file.name });
      loadAttachments();
    } catch (error) {
      toastRef.dismiss();
      toast.error('Upload failed', { detail: error.message });
    }
  }

  const onKeydown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      session.save().catch(() => {});
    }
  };
  const onBeforeUnload = (event) => {
    if (session.isDirty()) {
      session.flush().catch(() => {});
      event.preventDefault();
      event.returnValue = '';
    }
  };
  const onVisibility = () => { if (document.visibilityState === 'hidden') session.flush().catch(() => {}); };

  setLeaveGuard(async () => {
    if (!session.isDirty()) return true;
    try {
      await session.flush();
      return true;
    } catch {
      const answer = await confirmDialog({
        title: 'Leave without saving?',
        message: 'Your latest changes could not be saved to the server. They are kept on this device and can be restored next time.',
        confirmLabel: 'Leave anyway',
        cancelLabel: 'Stay',
        danger: true,
      });
      return answer === 'confirm';
    }
  });

  titleEl.addEventListener('input', onInput);
  contentEl.addEventListener('input', onInput);
  fileInput.addEventListener('change', onFile);
  main.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisibility);

  offerDraftRestore();
  if (contentEl.value) detector.analyzeNow(contentEl.value);
  else drawDetection();
  setStatus(note ? 'saved' : 'idle');
  loadAttachments();
  if (!note) contentEl.focus();

  return () => {
    session.flush().catch(() => {});
    session.destroy();
    detector.destroy();
    backdrop.destroy();
    recognition?.stop();
    clearTimeout(undoTimer);
    main.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
