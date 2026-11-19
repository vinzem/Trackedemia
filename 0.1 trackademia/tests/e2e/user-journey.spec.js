import { expect, test } from '@playwright/test';

const API = 'http://localhost:8788';
const state = async (request) => (await request.get(`${API}/__test/state`)).json();

test('create an event from a note, manage it in the first-party calendar, and delete it', async ({ page, request }) => {
  const email = `student-${Date.now()}@example.com`;

  await page.goto('/');
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toHaveCount(0);
  const signInHeroHeading = await page.locator('.auth-hero .text-4xl').boundingBox();
  const signInHeroFooter = await page.locator('.auth-hero > p').boundingBox();
  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toHaveCount(0);
  const createHeroHeading = await page.locator('.auth-hero .text-4xl').boundingBox();
  const createHeroFooter = await page.locator('.auth-hero > p').boundingBox();
  expect(createHeroHeading.y).toBeCloseTo(signInHeroHeading.y, 0);
  expect(createHeroFooter.y).toBeCloseTo(signInHeroFooter.y, 0);
  await page.getByLabel('Your name').fill('Naz Student');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 23, 23)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  await expect(page.getByText('Your notes will live here')).toBeVisible();

  await page.getByRole('link', { name: 'New note' }).first().click();
  await page.getByLabel('Title').fill('Errands');
  await page.getByLabel('Note', { exact: true }).fill('Dentist appointment tomorrow at 10am.\nBuy groceries');
  await expect(page.locator('.editor mark')).toHaveText('tomorrow at 10am');
  await expect(page.getByText('1 reminder detected')).toBeVisible();
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);

  let snapshot = await state(request);
  expect(snapshot.events).toHaveLength(1);
  expect(snapshot.events[0]).toMatchObject({ event_title: 'Dentist appointment', note_id: snapshot.notes[0].id, status: 'pending' });

  await page.getByRole('button', { name: /Dentist appointment, on calendar; open calendar/ }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole('heading', { name: /20\d\d/ })).toBeVisible();
  const calendarSurface = page.locator('[data-calendar-surface]');
  const headingText = await page.getByRole('heading', { name: /20\d\d/ }).textContent();
  const displayedYear = Number(headingText.match(/20\d{2}/)[0]);
  await page.getByRole('button', { name: /choose month and year/ }).click();
  await expect(page.getByRole('button', { name: `January ${displayedYear}` })).toBeVisible();
  let surfaceBox = await calendarSurface.boundingBox();
  await page.mouse.move(surfaceBox.x + 100, surfaceBox.y + 100);
  await page.mouse.wheel(0, 500);
  await expect(page.getByRole('heading', { name: String(displayedYear + 1), exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `January ${displayedYear + 1}` })).toBeVisible();
  await page.getByRole('button', { name: `January ${displayedYear + 1}` }).click();
  await expect(page.getByRole('button', { name: /choose month and year/ })).toContainText('January');
  surfaceBox = await calendarSurface.boundingBox();
  await page.waitForTimeout(450);
  await page.mouse.move(surfaceBox.x + 100, surfaceBox.y + 100);
  await page.mouse.wheel(0, 500);
  await expect(page.getByRole('button', { name: /choose month and year/ })).toContainText('February');
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Dentist appointment' }).click();
  await expect(page.getByText('From note: Errands')).toBeVisible();
  await expect(page.getByText('Dentist appointment tomorrow at 10am.', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Open note' }).click();
  const reminder = page.getByRole('article', { name: 'Reminder: Dentist appointment' });
  await expect(reminder.getByText('Saved')).toBeVisible();
  await expect(reminder.getByText(/10:00 AM – 11:00 AM/)).toBeVisible();

  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await expect(page.getByRole('heading', { name: /20\d\d/ })).toBeVisible();
  await page.getByRole('button', { name: 'Dentist appointment' }).click();
  await expect(page.getByText('From note: Errands')).toBeVisible();
  await expect(page.getByText('Dentist appointment tomorrow at 10am.', { exact: true })).toBeVisible();
  const eventCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Dentist appointment' }) });
  await eventCard.getByRole('button', { name: 'Edit' }).click();
  const editSheet = page.getByRole('dialog');
  await editSheet.getByLabel('Event title').fill('Dentist (rescheduled)');
  await editSheet.getByLabel('Start time').fill('11:30');
  await editSheet.getByLabel('End time').fill('12:15');
  await editSheet.getByRole('button', { name: 'Save changes' }).click();
  await expect(editSheet).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Dentist (rescheduled)' })).toBeVisible();
  snapshot = await state(request);
  expect(snapshot.events[0]).toMatchObject({ event_title: 'Dentist (rescheduled)', status: 'pending' });

  const editedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Dentist (rescheduled)' }) });
  await editedCard.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete event' }).click();
  await expect(page.getByText('No events on this day.')).toBeVisible();
  expect((await state(request)).events).toHaveLength(0);

  await page.goto('/notes?q=errands');
  await expect(page.getByRole('link', { name: /Errands/ })).toBeVisible();
  await page.getByLabel('Search notes').fill('nothing-matches');
  await expect(page.getByText('No matching notes')).toBeVisible();
});

test('editing a note date automatically reschedules its calendar event', async ({ page, request }) => {
  await page.goto('/onboarding');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(`reschedule-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);

  await page.goto('/notes/new');
  const note = page.getByLabel('Note', { exact: true });
  await note.fill('Pay electricity bill on December 15, 2099');
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);
  const [created] = (await state(request)).events;
  expect(created).toMatchObject({ event_title: 'Pay electricity bill' });

  await note.fill('Pay electricity bill on December 20, 2099');
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);
  const [rescheduled] = (await state(request)).events;
  expect(rescheduled.id).toBe(created.id);
  expect(rescheduled.start_datetime).not.toBe(created.start_datetime);

  await note.fill('The electricity bill was paid.');
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);
  expect((await state(request)).events).toHaveLength(0);
});

test('upcoming reminders due within two days are marked red', async ({ page, request }) => {
  await page.goto('/onboarding');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(`due-soon-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);

  await page.goto('/notes/new');
  await page.getByLabel('Note', { exact: true }).fill('Submit homework tomorrow');
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);
  await page.goto('/notes');

  const urgentReminder = page.locator('article[data-due-soon="true"]');
  await expect(urgentReminder).toBeVisible();
  await expect(urgentReminder.getByText('Due soon')).toBeVisible();
  await expect(urgentReminder).toHaveClass(/border-danger/);

  await urgentReminder.click();
  await page.getByRole('link', { name: 'Edit note' }).last().click();
  await page.getByLabel('Note', { exact: true }).fill('Homework completed.');
  await expect(page.locator('[data-status]')).toHaveText(/^Saved/);
  expect((await state(request)).events).toHaveLength(0);
});

test('create an unlinked event directly from the calendar', async ({ page, request }) => {
  await page.goto('/onboarding');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(`calendar-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);

  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await page.getByRole('button', { name: 'Add event' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Event title').fill('Study session');
  await sheet.getByRole('button', { name: 'Add event' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Study session' })).toBeVisible();
  const [event] = (await state(request)).events;
  expect(event).toMatchObject({ event_title: 'Study session', note_id: null });
});

test('protected routes redirect to onboarding and wrong passwords show an error', async ({ page }) => {
  await page.goto('/notes/new');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrongpass1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password do not match.')).toBeVisible();
});
