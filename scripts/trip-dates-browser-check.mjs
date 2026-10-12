import { expect } from '@playwright/test';

export async function runTripDatesBrowser(page, origin) {
  const created = await page.request.post(`${origin}/api/trips`, {
    headers: { origin },
    data: { name: 'Trip dates regression', timezone: 'America/Denver' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const tripUrl = `${origin}/trips/${id}`;
  const base = `${origin}/api/trips/${id}`;
  const tabs = page
    .getByRole('tablist', { name: 'Itinerary days' })
    .getByRole('tab');
  const read = async () => (await page.request.get(`${base}/itinerary`)).json();
  const selectDay = async (date) => {
    await tabs.filter({ hasText: date }).click();
    await expect(
      page.getByRole('heading', { name: date, exact: true }),
    ).toBeVisible();
  };
  async function editDates(startDate, endDate) {
    await page
      .getByRole('button', { name: 'Trip options', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Edit trip details', exact: true })
      .click();
    const form = page.getByRole('form', {
      name: 'Edit trip details',
      exact: true,
    });
    await form.getByLabel('Start date', { exact: true }).fill(startDate);
    await form.getByLabel('End date', { exact: true }).fill(endDate);
    await form
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
  }
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(tripUrl);
    await page
      .getByRole('link', { name: 'Set trip dates', exact: true })
      .click();
    await page.getByLabel('Start date', { exact: true }).fill('2028-02-28');
    await page.getByLabel('End date', { exact: true }).fill('2028-03-02');
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(page).toHaveURL(tripUrl);
    await expect(page.locator('.trip-title .eyebrow')).toHaveText(
      'Feb 28 – Mar 2, 2028',
    );
    await expect(tabs).toHaveCount(4);
    await expect(tabs.locator('.sr-only')).toHaveText([
      '2028-02-28 · 0 activities',
      '2028-02-29 · 0 activities',
      '2028-03-01 · 0 activities',
      '2028-03-02 · 0 activities',
    ]);
    expect((await read()).days).toEqual([]);
    await selectDay('2028-02-29');
    await page
      .getByRole('button', { name: 'Add activity', exact: true })
      .click();
    const add = page.getByRole('form', { name: 'Add activity', exact: true });
    await add.getByLabel('Activity title').fill('Leap day breakfast');
    await add.getByLabel('Start time').fill('09:00');
    await add
      .getByRole('button', { name: 'Add activity', exact: true })
      .click();
    await expect(add).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Leap day breakfast', exact: true }),
    ).toBeVisible();
    let plan = await read();
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].date).toBe('2028-02-29');
    const activityId = plan.days[0].activities[0].id;
    await page.reload();
    await expect(tabs.filter({ hasText: '2028-02-29' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('heading', { name: 'Leap day breakfast', exact: true }),
    ).toBeVisible();

    await editDates('2028-02-27', '2028-03-03');
    await expect(tabs).toHaveCount(6);
    await expect(page.locator('.trip-title .eyebrow')).toHaveText(
      'Feb 27 – Mar 3, 2028',
    );
    await expect(
      page.getByRole('heading', { name: 'Leap day breakfast', exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(tabs).toHaveCount(6);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await selectDay('2028-02-27');
    await expect(
      page.getByRole('heading', {
        name: 'A little room for adventure.',
        exact: true,
      }),
    ).toBeVisible();

    const saved = await page.request.post(`${base}/bookmarks`, {
      headers: { origin },
      data: {
        title: 'Museum for the last day',
        notes: 'Original bookmark notes',
      },
    });
    expect(saved.status()).toBe(201);
    const bookmark = await saved.json();
    await page.goto(`${tripUrl}?day=2028-03-03&bookmark=${bookmark.id}`);
    const schedule = page.getByRole('form', {
      name: 'Add activity',
      exact: true,
    });
    await schedule.getByLabel('Activity day').selectOption({ label: 'Mar 3' });
    await schedule
      .getByRole('button', { name: 'Add to itinerary', exact: true })
      .click();
    await expect(schedule).toHaveCount(0);
    await expect(
      page
        .locator('.activity-list')
        .getByRole('heading', { name: 'Museum for the last day', exact: true }),
    ).toBeVisible();
    plan = await read();
    expect(plan.days).toHaveLength(2);
    expect(plan.days[1]).toMatchObject({
      date: '2028-03-03',
      activities: [{ bookmarkId: bookmark.id }],
    });
    expect((await page.request.get(`${base}/bookmarks`)).status()).toBe(200);
    expect(
      (await (await page.request.get(`${base}/bookmarks`)).json()).items.some(
        (item) => item.id === bookmark.id,
      ),
    ).toBe(true);

    await selectDay('2028-02-29');
    await page
      .locator('.activity-list')
      .getByRole('button', { name: 'Expand Leap day breakfast', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Edit Leap day breakfast', exact: true })
      .click();
    const edit = page.getByRole('form', { name: 'Edit activity', exact: true });
    await edit.getByLabel('Activity day').selectOption({ label: 'Feb 28' });
    await edit
      .getByRole('button', { name: 'Save activity', exact: true })
      .click();
    await expect(edit).toHaveCount(0);
    await selectDay('2028-02-28');
    await expect(
      page.getByRole('heading', { name: 'Leap day breakfast', exact: true }),
    ).toBeVisible();
    plan = await read();
    expect(plan.days[0]).toMatchObject({
      date: '2028-02-28',
      activities: [{ id: activityId, startTime: '09:00' }],
    });

    await editDates('2028-02-28', '2028-02-29');
    await expect(
      page
        .getByRole('form', { name: 'Edit trip details', exact: true })
        .getByRole('alert'),
    ).toHaveText('Existing itinerary days fall outside those dates');
    expect((await read()).endDate).toBe('2028-03-03');
    await page.getByRole('link', { name: 'Back to trip', exact: true }).click();
    await editDates('', '');
    await expect(page.locator('.trip-title .eyebrow')).toHaveText(
      'Dates undecided',
    );
    await expect(tabs).toHaveCount(3);
    await expect(
      page.getByRole('heading', { name: 'Leap day breakfast', exact: true }),
    ).toBeVisible();
    console.log(
      'PASS: saved trip dates immediately populate the calendar, leap days, empty-day activities and moves, bookmark scheduling, range extension, and preserved plans.',
    );
  } finally {
    expect(
      (await page.request.delete(base, { headers: { origin } })).status(),
    ).toBe(200);
  }
}
