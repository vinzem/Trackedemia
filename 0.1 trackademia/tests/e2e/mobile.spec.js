import { expect, test } from '@playwright/test';

test('mobile layout: single column, FAB, bottom-sheet confirmation', async ({ page }) => {
  await page.goto('/onboarding');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(`mobile-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);

  await expect(page.locator('.app-sidebar')).toBeHidden();
  const fab = page.getByRole('link', { name: 'New note' }).last();
  await expect(fab).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width);

  await fab.click();
  await page.getByLabel('Note', { exact: true }).fill('Call the supplier Friday afternoon');
  await expect(page.locator('.editor mark')).toHaveText('Friday afternoon');
  await page.getByRole('button', { name: /Call the supplier/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('What time in the afternoon?')).toBeVisible();
  // Calendar is not connected yet, so the sheet offers to connect instead of failing.
  await expect(sheet.getByText('Connect Google Calendar to add this event')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(page.viewportSize().height - 2);
  await sheet.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(sheet).toBeHidden();
});
