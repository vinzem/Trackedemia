import { bootstrapScreen } from '../app.js';
import { getParam, navigate } from '../router.js';
import { consumeFlash, setState, subscribe } from '../state.js';
import { deleteNote, getNoteById, getNoteStats, resolveNote, selectNote } from '../features/notes.js';
import { detectReminder } from '../features/date-detection.js';
import {
  buildReminderDraft,
  confirmReminder,
  editReminder,
  formatReminderDate,
  formatReminderTime,
  getReminderStatusLabel,
  removeReminder,
  restoreReminder,
  setActiveReminder,
} from '../features/reminders.js';
import { AVAILABLE_CALENDARS, getCalendarLink } from '../features/calendar-sync.js';
import { createNavbar } from '../components/navbar.js';
import { createReminderCard } from '../components/reminder-card.js';
import { createReminderForm } from '../components/reminder-form.js';
import { renderHighlightedText } from '../components/note-editor.js';
import { createButton, setButtonLoading } from '../components/button.js';
import { openBottomSheet } from '../components/bottom-sheet.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { createElement, escapeHtml, icon } from '../utils/helpers.js';
import { formatDateTime } from '../utils/date-utils.js';

let noteId = null;
let mainEl = null;

function currentNote() {
  return getNoteById(noteId);
}

/** Shared sheet for editing an existing reminder or adding one manually. */
function openReminderSheet({ mode }) {
  const note = currentNote();
  const initial = mode === 'edit' ? note.reminder : buildReminderDraft(detectReminder(note.content), { noteId: note.id, fallbackTitle: note.title });
  const form = createReminderForm(initial, { calendars: [...AVAILABLE_CALENDARS] });

  const submit = async (sheet, button) => {
    setButtonLoading(button, true, 'Saving…');
    const values = form.getValue();
    const result = mode === 'edit' ? await editReminder(note.id, values) : await confirmReminder(note.id, values);
    if (!result.ok) {
      setButtonLoading(button, false);
      form.showErrors(result.errors);
      return;
    }
    sheet.close();
    showToast({ message: mode === 'edit' ? 'Reminder updated' : 'Added to Google Calendar', detail: 'Simulated calendar event saved.' });
  };

  const sheet = openBottomSheet({
    title: mode === 'edit' ? 'Edit reminder' : 'Add reminder',
    description: 'Changes sync to your connected calendar (simulated).',
    content: form.element,
    className: 'sheet--tall',
    actions: [
      { label: mode === 'edit' ? 'Save changes' : 'Add to Google Calendar', variant: 'primary', icon: 'check', keepOpen: true, onClick: submit },
      { label: 'Cancel', variant: 'ghost' },
    ],
  });
  form.onSubmit(() => submit(sheet, sheet.actionButtons[0]));
}

async function handleDeleteReminder() {
  const confirmed = await openModal({
    title: 'Delete reminder?',
    message: 'The event is removed from Google Calendar (simulated). Your note stays.',
    confirmLabel: 'Delete reminder',
    variant: 'danger',
    icon: 'trash',
  });
  if (!confirmed) return;
  const result = await removeReminder(noteId);
  if (!result.ok) return;
  showToast({
    message: 'Reminder deleted',
    variant: 'info',
    duration: 5000,
    action: { label: 'Undo', onClick: () => restoreReminder(noteId, result.removed) },
  });
}

async function handleOpenInCalendar() {
  const note = currentNote();
  const url = await getCalendarLink(note.reminder);
  const confirmed = await openModal({
    title: 'Open Google Calendar?',
    message: `Prototype: no real event was created. Google Calendar opens on ${formatReminderDate(note.reminder)} in a new tab.`,
    confirmLabel: 'Open calendar',
    icon: 'external',
  });
  if (!confirmed) return;
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  else showToast({ message: 'Pop-up blocked', detail: url, variant: 'info' });
}

function openMoreSheet() {
  openBottomSheet({
    title: 'Note options',
    actions: [
      { label: 'Edit note', icon: 'edit', onClick: () => navigate('newNote', { id: noteId }) },
      {
        label: 'Delete note',
        icon: 'trash',
        onClick: async () => {
          const confirmed = await openModal({ title: 'Delete this note?', message: 'The note and its linked reminder will be removed.', confirmLabel: 'Delete', variant: 'danger' });
          if (!confirmed) return;
          if (currentNote()?.reminder) await removeReminder(noteId);
          const removed = deleteNote(noteId);
          setState({ flash: { message: 'Note deleted', detail: removed?.title, variant: 'info' } });
          navigate('notes');
        },
      },
      { label: 'Cancel', variant: 'ghost' },
    ],
  });
}

function renderReminderSection(note) {
  if (note.reminder) {
    const actions = [
      createButton({ label: 'Edit Reminder', icon: 'edit', size: 'sm', annotation: 3, placement: 'top-left', onClick: () => openReminderSheet({ mode: 'edit' }) }),
      createButton({ label: 'Delete Reminder', icon: 'trash', size: 'sm', annotation: 4, placement: 'top-right', onClick: handleDeleteReminder }),
      createButton({ label: 'Open in Google Calendar', icon: 'external', variant: 'primary', block: true, annotation: 5, placement: 'inside-right', onClick: handleOpenInCalendar }),
    ];
    return createReminderCard({
      title: note.reminder.title,
      dateLabel: formatReminderDate(note.reminder),
      timeLabel: formatReminderTime(note.reminder),
      calendar: note.reminder.calendar,
      statusLabel: getReminderStatusLabel(note.reminder),
      actions,
    });
  }

  const detection = detectReminder(note.content);
  const action = detection.found
    ? createButton({ label: 'Review detected reminder', icon: 'sparkle', variant: 'primary', block: true, onClick: () => {
      setActiveReminder(buildReminderDraft(detection, { noteId: note.id, fallbackTitle: note.title }));
      navigate('confirmation', { id: note.id });
    } })
    : createButton({ label: 'Add reminder', icon: 'plus', block: true, onClick: () => openReminderSheet({ mode: 'add' }) });

  return createReminderCard({
    label: 'Reminder',
    title: detection.found ? 'A date was detected in this note' : 'No reminder linked',
    linked: false,
    actions: [action],
  });
}

function renderMain() {
  const note = currentNote();
  mainEl.replaceChildren();
  if (!note) {
    const missing = createElement(`
      <div class="empty-state">
        <h2 class="empty-state__title">Note not found</h2>
        <p class="empty-state__text">It may have been deleted.</p>
      </div>
    `);
    missing.appendChild(createButton({ label: 'Back to notes', variant: 'primary', onClick: () => navigate('notes') }));
    mainEl.appendChild(missing);
    return;
  }

  const stats = getNoteStats(note);
  const ranges = detectReminder(note.content).ranges;
  const article = createElement(`
    <article class="note-detail">
      <h2 class="heading-xl">${escapeHtml(note.title)}</h2>
      <p class="note-detail__meta">
        <span>Created ${escapeHtml(formatDateTime(note.createdAt))}</span>
        <span>Edited ${escapeHtml(formatDateTime(note.updatedAt))} · ${stats.words} words</span>
      </p>
      <div class="note-detail__body">${renderHighlightedText(note.content, ranges)}</div>
      ${note.attachments?.length ? `<div class="attachment-list">${note.attachments.map((item) => `
        <span class="attachment-chip">${icon(item.kind === 'photo' ? 'image' : 'file', { size: 16 })}<span>${escapeHtml(item.name)}</span></span>`).join('')}</div>` : ''}
    </article>
  `);
  article.appendChild(renderReminderSection(note));
  mainEl.appendChild(article);
}

bootstrapScreen('detail', (content) => {
  const note = resolveNote(getParam('id'));
  noteId = note?.id ?? getParam('id');
  if (note) selectNote(note.id);

  const view = createElement(`
    <section class="screen">
      <div class="screen__scroll" data-annotation-clip></div>
    </section>
  `);
  view.prepend(createNavbar({
    title: 'Note',
    onBack: () => navigate('notes'),
    backAnnotation: 1,
    actions: note ? [{ type: 'more', label: 'More options', onClick: openMoreSheet, annotation: 2 }] : [],
  }));
  mainEl = view.querySelector('.screen__scroll');
  content.appendChild(view);
  renderMain();

  subscribe((_, changed) => { if (changed.includes('notes')) renderMain(); });
  const flash = consumeFlash();
  if (flash) showToast({ message: flash.message, detail: flash.detail, variant: flash.variant || 'success' });
});
