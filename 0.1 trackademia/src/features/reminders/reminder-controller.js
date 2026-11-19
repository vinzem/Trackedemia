/**
 * Reminder workflows: confirm a detected event, edit, retry, undo and delete.
 * Coordinates the reminder sheet, the reminders API and user notifications.
 * Success is only shown after the API confirms the Google Calendar operation.
 */
import { confirmDialog } from '../../components/modal.js';
import { openReminderSheet } from '../../components/reminder-sheet.js';
import { toast } from '../../components/toast.js';
import { getState } from '../../state.js';
import { formatReminderWhen } from '../../utils/date-utils.js';
import { detectTimezone } from '../../utils/timezone.js';
import { loadCalendarState, startCalendarConnection } from '../calendar/calendar-controller.js';
import { createReminder, deleteReminder, syncReminder, updateReminder } from './reminder-service.js';

const userTimezone = () => getState().profile?.timezone || detectTimezone();

/** Translates API errors into in-sheet feedback. Returns true when handled as success. */
async function handleCreateError(error, ui, { onDuplicate }) {
  if (error.code === 'validation_error' && Array.isArray(error.details)) {
    ui.showFieldErrors(Object.fromEntries(error.details.map((d) => [d.path, d.message])));
    return false;
  }
  if (error.code === 'conflict' && error.details?.reminder) {
    const existing = error.details.reminder;
    if (existing.status === 'synced') {
      toast.info('Already on your calendar', { detail: `${existing.event_title} · ${formatReminderWhen(existing)}` });
      onDuplicate?.(existing);
      return true;
    }
    // A previous attempt was saved but did not sync: retry that one instead of duplicating.
    const synced = await syncReminder(existing.id);
    onDuplicate?.(synced, { retried: true });
    return true;
  }
  if (error.recovery === 'connect_calendar') {
    ui.showError(`${error.message} Use “Connect” below, then try again.`);
    await loadCalendarState({ force: true });
    return false;
  }
  if (error.recovery === 'choose_calendar') {
    ui.showFieldErrors({ calendar_id: error.message });
    return false;
  }
  ui.showError(error.retryable ? `${error.message} Your reminder was saved; press the button again to retry.` : error.message);
  return false;
}

/**
 * Opens the confirmation sheet for a detected event.
 * @param {{ event:object, ensureNote: () => Promise<object>, onCreated:(reminder:object) => void, onDismiss?:() => void }} options
 */
export async function confirmDetectedEvent({ event, ensureNote, onCreated, onDismiss }) {
  const calendar = getState().calendar.loaded ? getState().calendar : await loadCalendarState();
  const { calendars } = getState();
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
    calendars,
    calendarState: calendar,
    defaultTimezone: userTimezone(),
    onDismiss,
    onConnect: async () => {
      const note = await ensureNote().catch(() => null);
      startCalendarConnection(note ? `/notes/${note.id}/edit` : window.location.pathname);
    },
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
          sync: true,
        });
        onCreated(reminder);
        return true;
      } catch (error) {
        try {
          return await handleCreateError(error, ui, { onDuplicate: (reminder) => onCreated(reminder, { duplicate: true }) });
        } catch (retryError) {
          ui.showError(retryError.message);
          return false;
        }
      }
    },
  });
}

/** Opens the sheet to edit an existing reminder; syncs the change to Google. */
export async function editReminder(reminder, { onUpdated }) {
  const calendar = getState().calendar.loaded ? getState().calendar : await loadCalendarState();
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
      calendar_id: reminder.calendar_id,
    },
    calendars: getState().calendars,
    calendarState: calendar,
    defaultTimezone: userTimezone(),
    onConnect: () => startCalendarConnection(window.location.pathname),
    onSubmit: async (values, ui) => {
      try {
        const patch = {
          event_title: values.event_title,
          event_description: values.event_description || null,
          start_date: values.start_date,
          start_time: values.start_time,
          end_time: values.end_time,
          end_date: null,
          all_day: values.all_day,
          timezone: values.timezone,
          ...(values.calendar_id && values.calendar_id !== reminder.calendar_id ? { calendar_id: values.calendar_id, calendar_name: values.calendar_name } : {}),
        };
        if (values.all_day) patch.end_date = values.start_date;
        const updated = await updateReminder(reminder.id, patch);
        toast.success(updated.status === 'synced' ? 'Reminder updated on Google Calendar' : 'Reminder updated', { detail: formatReminderWhen(updated) });
        onUpdated(updated);
        return true;
      } catch (error) {
        if (error.code === 'validation_error' && Array.isArray(error.details)) {
          ui.showFieldErrors(Object.fromEntries(error.details.map((d) => [d.path, d.message])));
        } else {
          ui.showError(error.message);
        }
        if (error.status >= 500 || error.retryable) onUpdated(null, { refresh: true });
        return false;
      }
    },
  });
}

export async function retryReminderSync(reminder, { onUpdated }) {
  try {
    const updated = await syncReminder(reminder.id);
    toast.success('Synced to Google Calendar', { detail: `${updated.event_title} · ${formatReminderWhen(updated)}`, actions: updated.google_event_link ? [{ label: 'Open', href: updated.google_event_link }] : [] });
    onUpdated(updated);
  } catch (error) {
    toast.error('Sync failed', {
      detail: error.message,
      actions: error.recovery === 'connect_calendar'
        ? [{ label: 'Connect', onClick: () => startCalendarConnection(window.location.pathname) }]
        : error.retryable ? [{ label: 'Retry', onClick: () => retryReminderSync(reminder, { onUpdated }) }] : [],
    });
    onUpdated(null, { refresh: true });
  }
}

/** Undo right after creation: removes the Google event and the reminder. */
export async function undoReminder(reminder, { onUndone }) {
  try {
    await deleteReminder(reminder.id);
    toast.info('Reminder removed', { detail: 'The Google Calendar event was deleted.' });
    onUndone(reminder);
  } catch (error) {
    toast.error('Could not undo', { detail: error.message, actions: error.retryable ? [{ label: 'Retry', onClick: () => undoReminder(reminder, { onUndone }) }] : [] });
  }
}

/** Confirms, then deletes a reminder (and, by default, its calendar event). */
export async function removeReminder(reminder, { onDeleted }) {
  const synced = Boolean(reminder.google_event_id);
  const answer = await confirmDialog({
    title: 'Delete this reminder?',
    message: synced
      ? `“${reminder.event_title}” will also be deleted from ${reminder.calendar_name || 'Google Calendar'}.`
      : `“${reminder.event_title}” will be removed from this note.`,
    confirmLabel: synced ? 'Delete everywhere' : 'Delete reminder',
    secondaryLabel: synced ? 'Keep calendar event' : undefined,
    danger: true,
  });
  if (answer === 'cancel') return;
  const keepEvent = answer === 'secondary';
  try {
    await deleteReminder(reminder.id, { keepEvent });
    toast.success(keepEvent ? 'Reminder unlinked' : 'Reminder deleted', { detail: keepEvent ? 'The event stays on your Google Calendar.' : synced ? 'Removed from Google Calendar too.' : undefined });
    onDeleted(reminder);
  } catch (error) {
    toast.error('Could not delete reminder', {
      detail: error.message,
      actions: error.details?.can_keep_event
        ? [{ label: 'Remove only here', onClick: async () => { await deleteReminder(reminder.id, { keepEvent: true }); onDeleted(reminder); } }]
        : error.retryable ? [{ label: 'Retry', onClick: () => removeReminder(reminder, { onDeleted }) }] : [],
    });
  }
}
