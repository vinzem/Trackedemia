import { bootstrapScreen } from '../app.js';
import { getParam, navigate } from '../router.js';
import { consumeFlash, setState } from '../state.js';
import { DEMO_NOTE_TEXT, createAttachment, deleteNote, getNoteById, saveNote } from '../features/notes.js';
import { detectReminder, shouldTriggerReminderFlow } from '../features/date-detection.js';
import { buildReminderDraft, formatReminderSummary, setActiveReminder } from '../features/reminders.js';
import { createNavbar } from '../components/navbar.js';
import { NOTE_PLACEHOLDER, createNoteEditor } from '../components/note-editor.js';
import { createButton, createIconButton } from '../components/button.js';
import { markAnnotation } from '../components/annotation.js';
import { openBottomSheet } from '../components/bottom-sheet.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { createElement, debounce, escapeHtml, icon } from '../utils/helpers.js';
import { formatFriendlyDate, formatTime12 } from '../utils/date-utils.js';
import { validateNoteContent } from '../utils/validation.js';

const DICTATION_SAMPLES = [
  'Submit thesis draft next Monday at 3pm',
  'Study group Friday at 2pm in the library',
  'Pay tuition fees November 10 at 9am',
];

const page = {
  note: null,
  editor: null,
  detection: detectReminder(''),
  attachments: [],
  savedContent: '',
  dictationTimer: null,
  dictationIndex: 0,
  els: {},
};

function isDirty() {
  return page.editor.getValue() !== page.savedContent
    || JSON.stringify(page.attachments) !== JSON.stringify(page.note?.attachments || []);
}

function renderDetectionBanner() {
  const { banner } = page.els;
  const { detection, note } = page;
  banner.replaceChildren();
  banner.className = 'detection-banner';

  if (note?.reminder) {
    banner.classList.add('detection-banner--linked');
    banner.append(createElement(`<span class="detection-banner__icon">${icon('check', { size: 16 })}</span>`));
    banner.append(createElement(`<div class="detection-banner__text"><p class="detection-banner__title">Linked reminder</p><p class="text-caption">${escapeHtml(note.reminder.title)} · ${escapeHtml(formatReminderSummary(note.reminder))}</p></div>`));
    banner.append(createButton({ label: 'View', variant: 'secondary', size: 'sm', onClick: () => persist({ next: 'detail' }) }));
  } else if (detection.found) {
    banner.classList.add('detection-banner--detected');
    const when = [formatFriendlyDate(detection.date), formatTime12(detection.time)].filter(Boolean).join(' · ');
    banner.append(createElement(`<span class="detection-banner__icon">${icon('sparkle', { size: 16 })}</span>`));
    banner.append(createElement(`<div class="detection-banner__text"><p class="detection-banner__title">Reminder detected</p><p class="text-caption">${escapeHtml(when)}</p></div>`));
    banner.append(createButton({ label: 'Review', variant: 'secondary', size: 'sm', onClick: () => persist({ next: 'confirmation' }) }));
  } else {
    banner.classList.add('detection-banner--hint');
    banner.append(createElement(`<p class="text-caption">${icon('sparkle', { size: 14 })} Mention a date or time and Trackademia will suggest a reminder.</p>`));
  }
  markAnnotation(banner, 4, 'top-right');
}

const runDetection = () => {
  page.detection = detectReminder(page.editor.getValue());
  page.editor.setHighlights(page.detection.ranges);
  renderDetectionBanner();
};
const runDetectionSoon = debounce(runDetection, 120);

function renderAttachments() {
  const { attachmentList } = page.els;
  attachmentList.replaceChildren();
  attachmentList.hidden = page.attachments.length === 0;
  page.attachments.forEach((attachment) => {
    const chip = createElement(`
      <span class="attachment-chip">
        ${icon(attachment.kind === 'photo' ? 'image' : 'file', { size: 16 })}
        <span>${escapeHtml(attachment.name)}</span>
      </span>
    `);
    const remove = createIconButton({
      icon: 'x',
      label: `Remove ${attachment.name}`,
      size: 14,
      className: 'attachment-chip__remove',
      onClick: () => {
        page.attachments = page.attachments.filter((item) => item.id !== attachment.id);
        renderAttachments();
      },
    });
    chip.appendChild(remove);
    attachmentList.appendChild(chip);
  });
}

/** Saves the note, then routes to the next step of the workflow. */
function persist({ next = 'auto' } = {}) {
  stopDictation();
  const content = page.editor.getValue();
  const check = validateNoteContent(content);
  if (!check.valid) {
    showToast({ message: check.error, variant: 'error' });
    page.editor.focus();
    return;
  }

  const note = saveNote({ id: page.note?.id, content, attachments: page.attachments });
  page.note = note;
  page.savedContent = content;
  const detection = detectReminder(content);

  const target = next === 'auto'
    ? (shouldTriggerReminderFlow(detection, note) ? 'confirmation' : 'notes')
    : next;

  if (target === 'confirmation') {
    setActiveReminder(note.reminder ? { ...note.reminder, noteId: note.id } : buildReminderDraft(detection, { noteId: note.id, fallbackTitle: note.title }));
    navigate('confirmation', { id: note.id });
  } else if (target === 'detail') {
    navigate('detail', { id: note.id });
  } else {
    setState({ flash: { message: 'Note saved', detail: note.title } });
    navigate('notes');
  }
}

async function handleBack() {
  stopDictation();
  if (isDirty() && page.editor.getValue().trim()) {
    const discard = await openModal({
      title: 'Discard changes?',
      message: 'Your unsaved text will be lost.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      variant: 'danger',
    });
    if (!discard) return;
  }
  navigate('notes');
}

function stopDictation() {
  if (!page.dictationTimer) return;
  clearInterval(page.dictationTimer);
  page.dictationTimer = null;
  page.els.mic.classList.remove('is-active');
  page.els.mic.setAttribute('aria-pressed', 'false');
  page.els.listening.hidden = true;
  runDetection();
}

function toggleDictation() {
  if (page.dictationTimer) {
    stopDictation();
    return;
  }
  const sample = DICTATION_SAMPLES[page.dictationIndex % DICTATION_SAMPLES.length];
  page.dictationIndex += 1;
  const existing = page.editor.getValue();
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  const text = prefix + sample;
  let index = 0;

  page.els.mic.classList.add('is-active');
  page.els.mic.setAttribute('aria-pressed', 'true');
  page.els.listening.hidden = false;
  page.dictationTimer = setInterval(() => {
    index += 1;
    page.editor.setValue(existing + text.slice(0, index));
    runDetectionSoon();
    if (index >= text.length) stopDictation();
  }, 35);
}

function openAttachmentSheet() {
  openBottomSheet({
    title: 'Add attachment',
    description: 'Prototype: adds a placeholder file to the note.',
    actions: [
      { label: 'Photo', icon: 'image', onClick: () => addAttachment('photo') },
      { label: 'Document', icon: 'file', onClick: () => addAttachment('document') },
      { label: 'Cancel', variant: 'ghost' },
    ],
  });
}

function addAttachment(kind) {
  const attachment = createAttachment(kind);
  page.attachments = [...page.attachments, attachment];
  renderAttachments();
  showToast({ message: 'Attachment added', detail: `${attachment.name} (placeholder)` });
}

function openMoreSheet() {
  const actions = [
    {
      label: 'Insert example text',
      icon: 'sparkle',
      onClick: () => {
        const current = page.editor.getValue();
        page.editor.setValue(current ? `${current}\n${DEMO_NOTE_TEXT}` : DEMO_NOTE_TEXT);
        runDetection();
      },
    },
    {
      label: 'Clear note',
      icon: 'x',
      onClick: () => {
        page.editor.setValue('');
        runDetection();
        page.editor.focus();
      },
    },
  ];
  if (page.note) {
    actions.push({
      label: 'Delete note',
      icon: 'trash',
      onClick: async () => {
        const confirmed = await openModal({ title: 'Delete this note?', message: 'The note and its reminder will be removed.', confirmLabel: 'Delete', variant: 'danger' });
        if (!confirmed) return;
        deleteNote(page.note.id);
        setState({ flash: { message: 'Note deleted', variant: 'info' } });
        navigate('notes');
      },
    });
  }
  actions.push({ label: 'Cancel', variant: 'ghost' });
  openBottomSheet({ title: 'Note options', actions });
}

bootstrapScreen('newNote', (content) => {
  page.note = getNoteById(getParam('id'));
  const initialText = page.note?.content ?? (getParam('demo') === '1' ? DEMO_NOTE_TEXT : '');
  page.savedContent = page.note?.content ?? '';
  page.attachments = [...(page.note?.attachments || [])];

  const view = createElement(`
    <section class="screen">
      <div class="screen__scroll screen__scroll--editor" data-annotation-clip>
        <div class="editor-slot"></div>
        <div class="attachment-list" hidden></div>
      </div>
      <div class="detection-banner"></div>
      <div class="listening-pill" hidden><span class="listening-pill__dot"></span>Listening… (simulated)</div>
      <footer class="editor-toolbar"></footer>
    </section>
  `);

  view.prepend(createNavbar({
    title: page.note ? 'Edit Note' : 'New Note',
    onBack: handleBack,
    backAnnotation: 1,
    actions: [{ type: 'more', label: 'More options', onClick: openMoreSheet, annotation: 2 }],
  }));

  page.editor = createNoteEditor({
    value: initialText,
    placeholder: NOTE_PLACEHOLDER,
    onInput: runDetectionSoon,
    annotation: 3,
  });
  view.querySelector('.editor-slot').replaceWith(page.editor.element);

  const toolbar = view.querySelector('.editor-toolbar');
  const mic = createIconButton({ icon: 'mic', label: 'Dictate note (simulated)', onClick: toggleDictation, annotation: 5, placement: 'top-right', pressed: false });
  const attach = createIconButton({ icon: 'paperclip', label: 'Add attachment', onClick: openAttachmentSheet, annotation: 6, placement: 'top-right' });
  const save = createButton({ label: 'Save', variant: 'primary', icon: 'check', annotation: 7, placement: 'top-left', onClick: () => persist() });
  toolbar.append(createElement('<div class="editor-toolbar__tools"></div>'), save);
  toolbar.firstElementChild.append(mic, attach);

  page.els = {
    banner: view.querySelector('.detection-banner'),
    attachmentList: view.querySelector('.attachment-list'),
    listening: view.querySelector('.listening-pill'),
    mic,
  };

  content.appendChild(view);
  renderAttachments();
  runDetection();
  if (!getParam('embed')) page.editor.focus();

  const flash = consumeFlash();
  if (flash) showToast({ message: flash.message, detail: flash.detail, variant: flash.variant || 'info' });
});
