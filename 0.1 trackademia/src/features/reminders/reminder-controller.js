/** Reminder workflows for the first-party calendar. */
import { confirmDialog } from '../../components/modal.js';
import { openReminderSheet } from '../../components/reminder-sheet.js';
import { toast } from '../../components/toast.js';
import { getState } from '../../state.js';
import { formatReminderWhen } from '../../utils/date-utils.js';
import { detectTimezone } from '../../utils/timezone.js';
import { createReminder, deleteReminder, updateReminder } from './reminder-service.js';

const userTimezone = () => getState().profile?.timezone || detectTimezone();

function showCreateError(error, ui, onDuplicate) {
  if (error.code === 'validation_error' && Array.isArray(error.details)) {
    ui.showFieldErrors(Object.fromEntries(error.details.map((detail) => [detail.path, detail.message])));
    return;
  }
  if (error.code === 'conflict' && error.details?.reminder) {
    const existing = error.details.reminder;
    toast.info('Already on your calendar', { detail: `${existing.event_title} · ${formatReminderWhen(existing)}` });
    onDuplicate?.(existing, { duplicate: true });
    return;
  }
  ui.showError(error.message);
}

/** Opens a form to save a detected event into the user's calendar. */
export async function confirmDetectedEvent({ event, ensureNote, onCreated, onDismiss }) {
  openReminderSheet({
    mode: 'create',
    initial: {
      event_title: event.event_title,
      event_description: event.event_description,
      start_date: event.start_date,
      start_time: event.start_time,
      end_time: event.end_time,
      all_day: !event.start_time && !event.missing_fields?.includes('start_date') && !event.time_hint && !event.clarification,
      timezone: event.timezone || userTimezone(),
    },
    clarification: event.clarification,
    isPast: event.is_past,
    defaultTimezone: userTimezone(),
    onDismiss,
    onSubmit: async (values, ui) => {
      let note;
      try {
        note = await ensureNote();
      } catch (error) {
        ui.showError(`Save the note first: ${error.message}`);
        return false;
      }
      try {
        const reminder = await createReminder({
          ...values,
          note_id: note.id,
          source_text: event.source_text?.slice(0, 500) || null,
        });
        onCreated(reminder);
        return true;
      } catch (error) {
        showCreateError(error, ui, onCreated);
        return error.code === 'conflict' && Boolean(error.details?.reminder);
      }
    },
  });
}

/** Opens the form to edit a saved calendar event. */
export function editReminder(reminder, { onUpdated }) {
  openReminderSheet({
    mode: 'edit',
    initial: {
      event_title: reminder.event_title,
      event_description: reminder.event_description,
      start_date: reminder.local.start_date,
      start_time: reminder.local.start_time,
      end_time: reminder.local.end_time,
      all_day: reminder.all_day,
      timezone: reminder.timezone,
    },
    defaultTimezone: userTimezone(),
    onSubmit: async (values, ui) => {
      try {
        const updated = await updateReminder(reminder.id, {
          event_title: values.event_title,
          event_description: values.event_description || null,
          start_date: values.start_date,
          start_time: values.start_time,
          end_time: values.end_time,
          all_day: values.all_day,
          timezone: values.timezone,
        });
        toast.success('Calendar event updated', { detail: formatReminderWhen(updated) });
        onUpdated(updated);
        return true;
      } catch (error) {
        if (error.code === 'validation_error' && Array.isArray(error.details)) {
          ui.showFieldErrors(Object.fromEntries(error.details.map((detail) => [detail.path, detail.message])));
        } else {
          ui.showError(error.message);
        }
        return false;
      }
    },
  });
}

/** Removes a saved calendar event. */
export async function removeReminder(reminder, { onDeleted }) {
  const answer = await confirmDialog({
    title: 'Delete this event?',
    message: `“${reminder.event_title}” will be removed from your Trackademia calendar.`,
    confirmLabel: 'Delete event',
    danger: true,
  });
  if (answer !== 'confirm') return;
  try {
    await deleteReminder(reminder.id);
    toast.success('Calendar event deleted');
    onDeleted(reminder);
  } catch (error) {
    toast.error('Could not delete event', { detail: error.message });
  }
}

/** Undo immediately after saving a detected event. */
export async function undoReminder(reminder, { onUndone }) {
  try {
    await deleteReminder(reminder.id);
    toast.info('Calendar event removed');
    onUndone(reminder);
  } catch (error) {
    toast.error('Could not undo', { detail: error.message });
  }
}
