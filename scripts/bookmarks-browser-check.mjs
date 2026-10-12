import { artifactPath } from './artifacts.mjs';
import { expect } from '@playwright/test';
export async function runBookmarksBrowser(page, tripUrl) {
  await page.goto(tripUrl + '/bookmarks');
  await page.getByText('Manage collections', { exact: true }).click();
  await page
    .getByLabel('New collection', { exact: true })
    .fill('Coffee options');
  await page
    .getByRole('button', { name: 'Create collection', exact: true })
    .click();
  await expect(
    page.locator('.collection-manager').getByRole('status'),
  ).toHaveText('Collection saved.');
  await page.getByRole('button', { name: 'Add bookmark', exact: true }).click();
  const form = page.getByRole('form', { name: 'Save a bookmark' });
  await form.getByLabel('Title', { exact: true }).fill('A café to consider');
  await form
    .getByLabel('Link (optional)', { exact: true })
    .fill('https://example.test/cafe');
  await form.getByLabel('Category', { exact: true }).selectOption('cafe');
  await form
    .getByLabel('Notes (optional)', { exact: true })
    .fill('Meet here before exploring');
  await form.getByLabel('Coffee options', { exact: true }).check();
  await form
    .getByRole('button', { name: 'Save bookmark', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'A café to consider', exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: 'initial',
      path: artifactPath(`itinerary-bookmarks-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole('button', { name: 'Expand A café to consider', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Edit A café to consider', exact: true })
    .click();
  const edit = page.getByRole('form', { name: 'Edit bookmark' });
  await edit.getByLabel('Title', { exact: true }).fill('Coffee after lunch');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'Coffee after lunch' }),
  ).toBeVisible();
  await page.getByLabel('Filter by category').selectOption('hotel');
  await expect(
    page.getByText('No bookmarks match these filters.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  if (!(await page.locator('.collection-manager').evaluate((el) => el.open)))
    await page.getByText('Manage collections', { exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', {
      name: 'Delete collection Coffee options',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Coffee after lunch' }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('Filter by collection')
      .getByRole('option', { name: 'Coffee options' }),
  ).toHaveCount(0);
  const disclosure = page
    .locator('.bookmark-card')
    .filter({
      has: page.getByRole('heading', {
        name: 'Coffee after lunch',
        exact: true,
      }),
    })
    .locator('.card-disclosure');
  if ((await disclosure.getAttribute('aria-expanded')) !== 'true')
    await disclosure.click();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Remove Coffee after lunch', exact: true })
    .click();
  await expect(page.getByText('Keep the good ideas here.')).toBeVisible();
  await page.goto(tripUrl);
  console.log(
    'PASS: phone/tablet bookmark save, collections, editing, filters, collection removal preserves bookmarks, and bookmark removal.',
  );
}
