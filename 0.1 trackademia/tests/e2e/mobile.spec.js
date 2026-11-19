import { expect, test } from '@playwright/test';

test('mobile layout: single column, calendar access, and bottom-sheet event confirmation', async ({ page }) => {
  await page.goto('/onboarding');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(`mobile-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('trackademia1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/notes$/);

  await expect(page.locator('.app-sidebar')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Calendar' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await expect(page.getByRole('heading', { name: /20\d\d/ })).toBeVisible();
  const calendarWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(calendarWidth).toBeLessThanOrEqual(page.viewportSize().width);
  await page.goto('/notes');
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
  await expect(sheet.getByRole('button', { name: 'Add event' })).toBeEnabled();
  const box = await sheet.boundingBox();
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(page.viewportSize().height - 2);
  await sheet.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(sheet).toBeHidden();
});
