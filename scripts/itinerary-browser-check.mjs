import { artifactPath } from './artifacts.mjs';
import { expect } from '@playwright/test';
export async function runItineraryBrowser(page, tripUrl) {
  await page.goto(tripUrl);
  const itinerary = page.getByRole('region', {
    name: 'Itinerary',
    exact: true,
  });
  async function addDay(date) {
    await page.getByRole('button', { name: 'Trip options' }).click();
    await page
      .getByRole('button', { name: 'Manage days', exact: true })
      .click();
    const details = page.locator('.day-tools > details').filter({
      has: page.locator('form[aria-label="Add a day"]'),
    });
    if (!(await details.evaluate((el) => el.open)))
      await details.locator('summary').click();
    await details.getByLabel('Date', { exact: true }).fill(date);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/itinerary/days') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await details.getByRole('button', { name: 'Add day', exact: true }).click();
    const { id } = await (await saved).json();
    await expect(page).toHaveURL(`${tripUrl}?day=${id}`);
    await expect(
      page.getByRole('heading', { name: date, exact: true }),
    ).toBeVisible();
  }
  await addDay('2028-04-01');
  await addDay('2028-04-02');
  const selectedDay = new URL(page.url()).searchParams.get('day');
  await page.goto(tripUrl + '/itinerary?day=' + selectedDay);
  await expect(page).toHaveURL(tripUrl + '?day=' + selectedDay);
  await expect(
    page.getByRole('heading', { name: '2028-04-02', exact: true }),
  ).toBeVisible();
  async function addActivity(title) {
    await page
      .getByRole('button', { name: 'Add to trip', exact: true })
      .click();
    await page
      .locator('.quick-add-options')
      .getByRole('button', { name: 'Add activity', exact: true })
      .click();
    const form = page.getByRole('form', { name: 'Add activity', exact: true });
    await form.getByLabel('Activity title').fill(title);
    await form.getByLabel('Start time').fill('09:00');
    await form
      .getByRole('button', { name: 'Add activity', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(form).toHaveCount(0);
  }
  await addActivity('Morning coffee');
  await addActivity('Explore the neighborhood');
  const titles = page.locator('.activity-card h3');
  await page
    .getByRole('button', {
      name: 'Actions for Explore the neighborhood',
      exact: true,
    })
    .click();
  const reordered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/order') &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  );
  await page
    .getByRole('button', {
      name: 'Move Explore the neighborhood up',
      exact: true,
    })
    .click();
  await expect(titles).toHaveText([
    'Explore the neighborhood',
    'Morning coffee',
  ]);
  await reordered;
  await page.reload();
  await expect(titles).toHaveText([
    'Explore the neighborhood',
    'Morning coffee',
  ]);
  // Exercise the actual sortable keyboard sensor as well as the touch-friendly buttons.
  await page.setViewportSize({ width: 1024, height: 1200 });
  const handle = page.getByRole('button', {
    name: 'Reorder Explore the neighborhood',
    exact: true,
  });
  await expect(page.getByText('Updating discussion…')).toHaveCount(0);
  // Keep both collapsed cards in view so ArrowDown tests a reorder rather
  // than the keyboard sensor's separate offscreen-target scrolling behavior.
  await handle.scrollIntoViewIfNeeded();
  await expect(page.locator('.activity-card').first()).toBeInViewport();
  await expect(page.locator('.activity-card').last()).toBeInViewport();
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  // The keyboard sensor defers its listeners and measures targets on the next frames.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press('ArrowDown');
  // Drop only after the UI has registered the destination. Smooth scrolling
  // and collision detection can take more than two frames on a slower runner.
  await expect(itinerary.locator('.drop-after')).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(titles).toHaveText([
    'Morning coffee',
    'Explore the neighborhood',
  ]);
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: 'initial',
      path: artifactPath(`itinerary-plan-${width}.png`),
      fullPage: true,
    });
  }
  await itinerary
    .getByRole('button', { name: 'Expand Morning coffee', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Edit Morning coffee', exact: true })
    .click();
  const edit = page.getByRole('form', { name: 'Edit activity', exact: true });
  await edit.getByLabel('Activity title').fill('Breakfast together');
  await edit.getByLabel('Activity day').selectOption({ label: 'Apr 1' });
  await edit
    .getByRole('button', { name: 'Save activity', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Morning coffee', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('tablist', { name: 'Itinerary days' })
    .getByRole('tab')
    .filter({ hasText: '2028-04-01' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Breakfast together', exact: true }),
  ).toBeVisible();
  await page.goto(tripUrl + '/bookmarks');
  await page.getByRole('button', { name: 'Add bookmark', exact: true }).click();
  const bookmark = page.getByRole('form', { name: 'Save a bookmark' });
  await bookmark.getByLabel('Title', { exact: true }).fill('Museum option');
  await bookmark
    .getByRole('button', { name: 'Save bookmark', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Expand Museum option', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Add to itinerary', exact: true })
    .click();
  const schedule = page.getByRole('form', {
    name: 'Add activity',
    exact: true,
  });
  await expect(
    schedule.getByText('Museum option', { exact: true }),
  ).toBeVisible();
  await expect(schedule.getByLabel('Activity day')).toHaveValue('');
  await schedule.getByLabel('Activity day').selectOption({ label: 'Apr 2' });
  const scheduledDayId = await schedule.getByLabel('Activity day').inputValue();
  await schedule
    .getByRole('button', { name: 'Add to itinerary', exact: true })
    .click();
  await expect(schedule).toHaveCount(0);
  await expect(
    page
      .locator('.activity-list')
      .getByRole('heading', { name: 'Museum option', exact: true }),
  ).toBeVisible();
  await page.goto(tripUrl + '/bookmarks');
  await page
    .getByRole('button', { name: 'Expand Museum option', exact: true })
    .click();
  await expect(page.getByText('Planned for 2028-04-02')).toBeVisible();
  await page.goto(`${tripUrl}?day=${scheduledDayId}`);
  await itinerary
    .getByRole('button', { name: 'Expand Museum option', exact: true })
    .click();
  page.once('dialog', (d) => d.accept());
  await itinerary
    .getByRole('button', { name: 'Remove Museum option', exact: true })
    .click();
  await expect(
    itinerary.getByRole('heading', { name: 'Museum option', exact: true }),
  ).toHaveCount(0);
  await page.goto(tripUrl + '/bookmarks');
  await expect(
    page.getByRole('heading', { name: 'Museum option', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Planned for 2028-04-02')).toHaveCount(0);
  await page.goto(tripUrl);
  console.log(
    'PASS: phone/tablet itinerary, native dates/times, activity creation/edit/move, persistent button and keyboard ordering, bookmark scheduling and preservation.',
  );
}
