import { bootstrapScreen } from '../app.js';
import { getParam, navigate } from '../router.js';
import { setState } from '../state.js';
import { DEMO_NOTE_TEXT, createNote, getNoteById } from '../features/notes.js';
import { detectReminder } from '../features/date-detection.js';
import {
  buildReminderDraft,
  clearActiveReminder,
  confirmReminder,
  getActiveReminder,
  setActiveReminder,
} from '../features/reminders.js';
import { AVAILABLE_CALENDARS } from '../features/calendar-sync.js';
import { createNavbar } from '../components/navbar.js';
import { createNoteEditor } from '../components/note-editor.js';
import { createButton, createIconButton, setButtonLoading } from '../components/button.js';
import { createReminderForm } from '../components/reminder-form.js';
import { openBottomSheet } from '../components/bottom-sheet.js';
import { showToast } from '../components/toast.js';
import { createElement, escapeHtml, icon } from '../utils/helpers.js';

function resolveContext() {
  const note = getNoteById(getParam('id'));
  const content = note?.content ?? DEMO_NOTE_TEXT;
  const detection = detectReminder(content);
  const active = getActiveReminder();

  let draft;
  if (note && active?.noteId === note.id) draft = active;
  else if (note?.reminder) draft = { ...note.reminder, noteId: note.id };
  else draft = buildReminderDraft(detection, { noteId: note?.id ?? null, fallbackTitle: note?.title });

  setActiveReminder(draft);
  return { note, content, detection, draft };
}

/** The New Note screen, shown inert behind the sheet. */
function renderBackground(view, { note, content, detection }) {
  view.prepend(createNavbar({
    title: note ? 'Edit Note' : 'New Note',
    onBack: () => {},
    actions: [{ type: 'more', label: 'More options', onClick: () => {} }],
  }));
  const editor = createNoteEditor({ value: content });
  editor.setHighlights(detection.ranges);
  view.querySelector('.editor-slot').replaceWith(editor.element);

  const toolbar = view.querySelector('.editor-toolbar');
  const tools = createElement('<div class="editor-toolbar__tools"></div>');
  tools.append(
    createIconButton({ icon: 'mic', label: 'Dictate note (simulated)' }),
    createIconButton({ icon: 'paperclip', label: 'Add attachment' }),
  );
  toolbar.append(tools, createButton({ label: 'Save', variant: 'primary', icon: 'check' }));
}

function openConfirmationSheet(context) {
  const { note, content, detection } = context;
  let draft = context.draft;
  const form = createReminderForm(draft, {
    calendars: [...AVAILABLE_CALENDARS],
    annotations: { title: 1, date: 2, time: 3, calendar: 4 },
  });
  const source = detection.found ? `We found “${detection.expression}” in your note.` : 'We could not find a date, so tomorrow is suggested.';
  const intro = createElement(`<p class="sheet__description">${escapeHtml(source)} Check the details before adding it to Google Calendar.</p>`);
  const content$ = createElement('<div class="stack-2"></div>');
  content$.append(intro, form.element);

  let finished = false;
  const handleDismiss = () => {
    if (finished) return;
    finished = true;
    clearActiveReminder();
    if (note?.reminder) {
      navigate('detail', { id: note.id });
      return;
    }
    setState({ flash: { message: 'Reminder dismissed', detail: note ? 'Your note is saved without a reminder.' : 'Nothing was added to your calendar.', variant: 'info' } });
    navigate('newNote', note ? { id: note.id } : { demo: 1 });
  };

  const handleConfirm = async (sheet, button) => {
    draft = form.getValue();
    setActiveReminder(draft);
    setButtonLoading(button, true, 'Adding to Google Calendar…');
    const target = note || createNote({ content });
    const result = await confirmReminder(target.id, { ...draft, noteId: target.id });
    if (!result.ok) {
      setButtonLoading(button, false);
      form.showErrors(result.errors);
      if (result.errors.calendar || result.errors.note) {
        showToast({ message: 'Could not add reminder', detail: result.errors.calendar || result.errors.note, variant: 'error' });
      }
      return;
    }
    finished = true;
    sheet.close();
    navigate('success', { id: target.id });
  };

  const sheet = openBottomSheet({
    title: 'Reminder detected ✨',
    content: content$,
    className: 'sheet--tall',
    onDismiss: handleDismiss,
    actions: [
      { label: 'Add to Google Calendar', variant: 'primary', icon: 'calendar', annotation: 5, keepOpen: true, onClick: handleConfirm },
      { label: 'Dismiss', variant: 'ghost', annotation: 6, dismiss: true },
    ],
  });
  form.onSubmit(() => handleConfirm(sheet, sheet.actionButtons[0]));
}

bootstrapScreen('confirmation', (content) => {
  const context = resolveContext();
  const view = createElement(`
    <section class="screen screen--behind-sheet" inert>
      <div class="screen__scroll screen__scroll--editor">
        <div class="editor-slot"></div>
      </div>
      <div class="detection-banner detection-banner--detected">
        <span class="detection-banner__icon">${icon('sparkle', { size: 16 })}</span>
        <div class="detection-banner__text"><p class="detection-banner__title">Reminder detected</p></div>
      </div>
      <footer class="editor-toolbar"></footer>
    </section>
  `);
  renderBackground(view, context);
  content.appendChild(view);
  openConfirmationSheet(context);
});
