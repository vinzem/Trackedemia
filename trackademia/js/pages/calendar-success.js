import { bootstrapScreen } from '../app.js';
import { getParam, navigate } from '../router.js';
import { getNoteById, resolveNote, saveNote, selectNote } from '../features/notes.js';
import { detectReminder } from '../features/date-detection.js';
import { formatReminderSummary, removeReminder } from '../features/reminders.js';
import { createNavbar } from '../components/navbar.js';
import { createNoteEditor } from '../components/note-editor.js';
import { createButton } from '../components/button.js';
import { showToast } from '../components/toast.js';
import { createElement, debounce, escapeHtml, icon } from '../utils/helpers.js';
import { validateNoteContent } from '../utils/validation.js';

const page = { note: null, editor: null, statusEl: null };

function renderStatus() {
  const { note, statusEl } = page;
  const reminder = getNoteById(note.id)?.reminder;
  statusEl.className = `detection-banner ${reminder ? 'detection-banner--linked' : 'detection-banner--hint'}`;
  statusEl.innerHTML = reminder
    ? `<span class="detection-banner__icon">${icon('check', { size: 16 })}</span>
       <div class="detection-banner__text"><p class="detection-banner__title">Linked to Google Calendar</p>
       <p class="text-caption">${escapeHtml(reminder.calendar)} calendar · simulated event</p></div>`
    : `<p class="text-caption">${icon('sparkle', { size: 14 })} Reminder removed. The detected date is still highlighted.</p>`;
}

function showSuccessToast() {
  const reminder = getNoteById(page.note.id)?.reminder;
  if (!reminder) return;
  showToast({
    message: 'Added to Google Calendar',
    detail: `${reminder.title} · ${formatReminderSummary(reminder)}`,
    variant: 'success',
    duration: 0,
    annotation: 1,
    action: {
      label: 'Undo',
      annotation: 2,
      onClick: async () => {
        const result = await removeReminder(page.note.id);
        renderStatus();
        showToast({
          message: result.ok ? 'Reminder removed' : 'Nothing to undo',
          detail: result.ok ? 'The simulated calendar event was deleted.' : '',
          variant: 'info',
        });
      },
    },
  });
}

function save() {
  const content = page.editor.getValue();
  const check = validateNoteContent(content);
  if (!check.valid) {
    showToast({ message: check.error, variant: 'error' });
    return;
  }
  const note = saveNote({ id: page.note.id, content });
  navigate('detail', { id: note.id });
}

function renderMissing(content) {
  const view = createElement(`
    <section class="screen">
      <div class="empty-state">
        <h2 class="empty-state__title">No note to show</h2>
        <p class="empty-state__text">Create a note with a date to see this screen.</p>
      </div>
    </section>
  `);
  view.prepend(createNavbar({ title: 'New Note', onBack: () => navigate('notes'), backAnnotation: 3 }));
  view.querySelector('.empty-state').appendChild(createButton({ label: 'Create Note', variant: 'primary', onClick: () => navigate('newNote') }));
  content.appendChild(view);
}

bootstrapScreen('success', (content) => {
  page.note = getParam('id') ? getNoteById(getParam('id')) : resolveNote(null, { preferLinked: true });
  if (!page.note) {
    renderMissing(content);
    return;
  }
  selectNote(page.note.id);

  const view = createElement(`
    <section class="screen">
      <div class="screen__scroll screen__scroll--editor" data-annotation-clip>
        <div class="editor-slot"></div>
      </div>
      <div class="detection-banner"></div>
      <footer class="editor-toolbar editor-toolbar--end"></footer>
    </section>
  `);
  view.prepend(createNavbar({ title: 'New Note', onBack: () => navigate('notes'), backAnnotation: 3 }));

  page.editor = createNoteEditor({ value: page.note.content, annotation: 4 });
  const highlight = () => page.editor.setHighlights(detectReminder(page.editor.getValue()).ranges);
  page.editor.textarea.addEventListener('input', debounce(highlight, 120));
  highlight();
  view.querySelector('.editor-slot').replaceWith(page.editor.element);

  page.statusEl = view.querySelector('.detection-banner');
  view.querySelector('.editor-toolbar').appendChild(createButton({
    label: 'Save',
    variant: 'primary',
    icon: 'check',
    annotation: 5,
    placement: 'top-left',
    onClick: save,
  }));

  content.appendChild(view);
  renderStatus();
  showSuccessToast();
});
