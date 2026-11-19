import { expect, test } from '@playwright/test';

const API = 'http://localhost:8788';
const state = async (request) => (await request.get(`${API}/__test/state`)).json();

/** Simulates Google's consent screen: approve and redirect back with a code. */
async function approveGoogleConsent(page) {
  await page.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url());
    const callback = new URL(url.searchParams.get('redirect_uri'));
    callback.searchParams.set('code', 'good-code');
    callback.searchParams.set('state', url.searchParams.get('state'));
    callback.searchParams.set('scope', url.searchParams.get('scope'));
    await route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });
}

test('complete journey: register → connect calendar → note → detect → confirm → edit → delete', async ({ page, request }) => {
  const email = `student-${Date.now()}@example.com`;

  // 1. Register
  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('Naz Student');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByText('Your notes will live here')).toBeVisible();

  // 2. Connect Google Calendar (real OAuth flow, consent screen simulated)
  await approveGoogleConsent(page);
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Connect Google Calendar' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText('Google Calendar connected').first()).toBeVisible();
  await expect(page.getByText('student@gmail.com')).toBeVisible();
  await expect(page.locator('#default-calendar')).toHaveValue('primary-cal@example.com');

  // 3. Create a note
  await page.getByRole('link', { name: 'New note' }).first().click();
  await page.getByLabel('Title').fill('Errands');
  await page.getByLabel('Note', { exact: true }).fill('Dentist appointment tomorrow at 10am.\nBuy groceries');

  // 4. Detect + highlight the scheduling expression
  await expect(page.locator('.editor mark')).toHaveText('tomorrow at 10am');
  await expect(page.getByText('1 reminder detected')).toBeVisible();
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);

  // 5. Review the reminder
  await page.getByRole('button', { name: /Dentist appointment/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Event title')).toHaveValue('Dentist appointment');
  await expect(sheet.getByLabel('Start time')).toHaveValue('10:00');
  await expect(sheet.getByLabel('Google Calendar')).toHaveValue('primary-cal@example.com');

  // 6. Confirm
  await sheet.getByRole('button', { name: 'Add to Google Calendar' }).click();
  await expect(sheet).toBeHidden();
  const success = page.locator('[data-success]');
  await expect(success.getByText('Added to Google Calendar')).toBeVisible();
  await expect(success.getByText('Student')).toBeVisible();
  await expect(success.getByRole('link', { name: 'Open in Google Calendar' })).toHaveAttribute('href', /google\.com\/calendar/);

  // 7. Verify the event really exists in (fake) Google Calendar, linked in the DB
  let snapshot = await state(request);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0]).toMatchObject({ summary: 'Dentist appointment', start: { timeZone: 'Asia/Manila' } });
  expect(snapshot.events[0].start.dateTime).toMatch(/T10:00:00$/);
  expect(snapshot.reminders[0]).toMatchObject({ status: 'synced', google_event_id: snapshot.events[0].id, note_id: snapshot.notes[0].id });

  // Duplicate prevention: the chip now shows the event is already on the calendar
  await expect(page.getByRole('button', { name: /Dentist appointment.*On calendar/ })).toBeVisible();

  // 8. Open note detail
  await page.getByRole('link', { name: 'Back to note' }).click();
  const card = page.getByRole('article', { name: 'Reminder: Dentist appointment' });
  await expect(card.getByText('On Google Calendar')).toBeVisible();
  await expect(card.getByText(/10:00 AM – 11:00 AM/)).toBeVisible();

  // 9. Edit reminder
  await card.getByRole('button', { name: 'Edit' }).click();
  const editSheet = page.getByRole('dialog');
  await editSheet.getByLabel('Event title').fill('Dentist (rescheduled)');
  await editSheet.getByLabel('Start time').fill('11:30');
  await editSheet.getByLabel('End time').fill('12:15');
  await editSheet.getByRole('button', { name: 'Save changes' }).click();
  await expect(editSheet).toBeHidden();
  const edited = page.getByRole('article', { name: 'Reminder: Dentist (rescheduled)' });
  await expect(edited.getByText(/11:30 AM – 12:15 PM/)).toBeVisible();
  snapshot = await state(request);
  expect(snapshot.events[0].summary).toBe('Dentist (rescheduled)');
  expect(snapshot.events[0].start.dateTime).toMatch(/T11:30:00$/);

  // 10. Delete reminder (and its calendar event)
  await edited.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete everywhere' }).click();
  await expect(edited).toBeHidden();
  await expect(page.getByText('No reminders yet.')).toBeVisible();
  snapshot = await state(request);
  expect(snapshot.events).toHaveLength(0);
  expect(snapshot.reminders).toHaveLength(0);

  // Notes persist and are searchable
  await page.goto('/notes?q=errands');
  await expect(page.getByRole('link', { name: /Errands/ })).toBeVisible();
  await page.getByLabel('Search notes').fill('nothing-matches');
  await expect(page.getByText('No matching notes')).toBeVisible();
});

test('undo removes a just-created calendar event', async ({ page, request }) => {
  await page.goto('/onboarding');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(`undo-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await approveGoogleConsent(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Connect Google Calendar' }).click();
  await expect(page.locator('#default-calendar')).toBeVisible();

  await page.goto('/notes/new');
  await page.getByLabel('Note', { exact: true }).fill('Pay electricity bill on the 15th');
  await page.getByRole('button', { name: /Pay electricity bill/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('All-day event')).toBeChecked();
  const before = (await state(request)).events.length;
  await sheet.getByRole('button', { name: 'Add to Google Calendar' }).click();
  await expect(page.locator('[data-success]').getByText('All day')).toBeVisible();
  expect((await state(request)).events.length).toBe(before + 1);
  await page.locator('[data-success]').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Reminder removed')).toBeVisible();
  expect((await state(request)).events.length).toBe(before);
});

test('protected routes redirect to onboarding and wrong passwords show an error', async ({ page }) => {
  await page.goto('/notes/new');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrongpass1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password do not match.')).toBeVisible();
});
