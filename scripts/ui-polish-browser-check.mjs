import { artifactPath } from './artifacts.mjs';
import { expect } from '@playwright/test';

export async function runUiPolishBrowser(page, origin) {
  const headers = { origin };
  const created = await page.request.post(`${origin}/api/trips`, {
    headers,
    data: {
      name: 'a weekend in seattle',
      description: 'Good coffee, open plans, and a little time together.',
      timezone: 'America/Denver',
      startDate: '2028-04-01',
      endDate: '2028-04-02',
      links: [
        { label: 'Our shared photos', url: 'https://example.test/photos' },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const base = `${origin}/api/trips/${id}`;
  const url = `${origin}/trips/${id}`;
  const read = async () => (await page.request.get(`${base}/itinerary`)).json();
  const cards = page.locator('.activity-list .activity-card');
  const titles = cards.locator('h3');
  async function delayed(pattern, method, action, pending) {
    let release, complete, routeError;
    let intercepted = false;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const finished = new Promise((resolve) => {
      complete = resolve;
    });
    const handler = async (route) => {
      if (route.request().method() !== method) return route.continue();
      intercepted = true;
      try {
        await gate;
        await route.continue();
      } catch (error) {
        routeError = error;
      } finally {
        complete();
      }
    };
    await page.route(pattern, handler);
    try {
      await action();
      await expect.poll(() => intercepted).toBe(true);
      await pending();
    } finally {
      release();
      if (intercepted) await finished;
      await page.unroute(pattern, handler);
      if (routeError) throw routeError;
    }
  }
  async function failing(pattern, method, action) {
    const handler = (route) =>
      route.request().method() === method
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { message: 'Temporary test failure. Try again.' },
            }),
          })
        : route.continue();
    await page.route(pattern, handler);
    try {
      await action();
    } finally {
      await page.unroute(pattern, handler);
    }
  }
  try {
    const dayResponse = await page.request.post(`${base}/itinerary/days`, {
      headers,
      data: { date: '2028-04-01', version: 0 },
    });
    expect(dayResponse.status()).toBe(201);
    const day = await dayResponse.json();
    let version = 1;
    const ids = [];
    for (const [title, startTime] of [
      ['Morning coffee', '09:00'],
      ['Beach walk', '10:30'],
      ['Dinner together', '18:30'],
    ]) {
      const response = await page.request.post(`${base}/itinerary/activities`, {
        headers,
        data: {
          dayId: day.id,
          title,
          startTime,
          notes: 'Meet by the lobby. Bring a little time to explore together.',
          version,
        },
      });
      expect(response.status()).toBe(201);
      ids.push((await response.json()).id);
      version++;
    }
    const saved = await page.request.post(`${base}/bookmarks`, {
      headers,
      data: {
        title: 'A museum for tomorrow',
        notes: 'Keep the afternoon open.',
        category: 'attraction',
      },
    });
    expect(saved.status()).toBe(201);
    const bookmark = await saved.json();
    await page.goto(`${url}?day=${day.id}`);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const handle = cards
        .first()
        .getByRole('button', { name: 'Reorder Morning coffee', exact: true });
      if (width <= 600) await expect(handle).toBeHidden();
      else {
        await expect(handle).toBeVisible();
        const rect = await cards.first().locator('.card').boundingBox();
        const grip = await handle.boundingBox();
        expect(grip.x).toBeGreaterThan(rect.x + rect.width - 55);
        expect(grip.y).toBeLessThan(rect.y + 50);
      }
      const selected = page.locator('.date[aria-selected="true"] .number');
      expect(
        await selected.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe('rgb(37, 99, 235)');
      await page.screenshot({
        caret: 'initial',
        path: artifactPath(`itinerary-polish-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1280, height: 1200 });
    await delayed(
      `${base}/itinerary/days/${day.id}/order`,
      'PUT',
      async () => {
        const grip = await cards
          .first()
          .getByRole('button', { name: 'Reorder Morning coffee', exact: true })
          .boundingBox();
        const last = await cards.last().boundingBox();
        await page.mouse.move(
          grip.x + grip.width / 2,
          grip.y + grip.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(
          last.x + last.width / 2,
          last.y + last.height / 2,
          { steps: 12 },
        );
        await expect(page.locator('.drop-after, .drop-before')).toHaveCount(1);
        await page.mouse.up();
      },
      async () => {
        await expect(titles).toHaveText([
          'Beach walk',
          'Dinner together',
          'Morning coffee',
        ]);
        expect(
          (await read()).days[0].activities.map((item) => item.title),
        ).toEqual(['Morning coffee', 'Beach walk', 'Dinner together']);
      },
    );
    await expect
      .poll(async () =>
        (await read()).days[0].activities.map((item) => item.title),
      )
      .toEqual(['Beach walk', 'Dinner together', 'Morning coffee']);
    await expect(page.locator('.activity-list')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    const coffee = page.locator(`[data-activity-id="${ids[0]}"]`);
    // Comments opens the collapsed card and focuses its composer. Avoid a
    // separate expansion click racing the disclosure transition/data load.
    await coffee
      .getByRole('button', { name: 'Comments for Morning coffee', exact: true })
      .click();
    await expect(coffee.getByLabel('Your comment')).toBeFocused();
    await coffee.getByLabel('Your comment').fill('Keep this unfinished draft');
    const toggle = page.getByRole('button', {
      name: /Bookmarks Ideas for the trip/,
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await delayed(
      `${base}/votes`,
      'POST',
      async () => {
        await coffee
          .getByRole('button', { name: 'I’m interested', exact: true })
          .click();
      },
      async () => {
        await expect(
          coffee.getByRole('button', { name: 'Remove my vote', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(
          coffee.getByRole('button', { name: 'Remove my vote', exact: true }),
        ).toHaveAttribute('aria-busy', 'true');
      },
    );
    await expect(
      coffee.getByRole('button', { name: 'Remove my vote', exact: true }),
    ).toHaveAttribute('aria-busy', 'false');
    await failing(`${base}/votes`, 'POST', async () => {
      await coffee
        .getByRole('button', { name: 'Remove my vote', exact: true })
        .click();
      await expect(coffee.getByRole('alert')).toContainText(
        'Temporary test failure',
      );
      await expect(
        coffee.getByRole('button', { name: 'Remove my vote', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
    await coffee
      .getByRole('button', { name: 'Retry vote', exact: true })
      .click();
    await expect(
      coffee.getByRole('button', { name: 'I’m interested', exact: true }),
    ).toBeEnabled();

    await coffee
      .getByRole('button', { name: 'Edit activity title inline', exact: true })
      .click();
    await coffee
      .getByLabel('Activity title', { exact: true })
      .fill('Coffee and breakfast');
    await coffee.getByLabel('Activity title', { exact: true }).press('Enter');
    await expect(
      coffee.getByRole('heading', {
        name: 'Coffee and breakfast',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      coffee.getByRole('button', {
        name: 'Edit activity title inline',
        exact: true,
      }),
    ).toBeFocused();
    await expect(coffee.getByLabel('Your comment')).toHaveValue(
      'Keep this unfinished draft',
    );
    await expect(coffee.locator('.card-disclosure')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await coffee
      .getByRole('button', { name: 'Edit notes inline', exact: true })
      .click();
    await coffee
      .getByLabel('Notes', { exact: true })
      .fill('Meet upstairs.\nWe have a little extra time.');
    await coffee.getByLabel('Your comment').click();
    await expect(
      coffee.getByRole('button', { name: 'Edit notes inline', exact: true }),
    ).toContainText('Meet upstairs.');
    await expect(coffee.getByLabel('Your comment')).toBeFocused();
    await coffee
      .getByRole('button', { name: 'Edit start time inline', exact: true })
      .click();
    await coffee.getByLabel('Start time', { exact: true }).fill('09:45');
    await coffee.getByLabel('Start time', { exact: true }).press('Enter');
    await expect(
      coffee.getByRole('button', {
        name: 'Edit start time inline',
        exact: true,
      }),
    ).toHaveText('9:45 AM');

    await coffee
      .getByRole('button', { name: 'Edit activity title inline', exact: true })
      .click();
    await coffee
      .getByLabel('Activity title', { exact: true })
      .fill('Saved after retry');
    await failing(
      `${base}/itinerary/activities/${ids[0]}`,
      'PATCH',
      async () => {
        await coffee
          .getByLabel('Activity title', { exact: true })
          .press('Enter');
        await expect(
          coffee.getByRole('button', { name: 'Retry saving', exact: true }),
        ).toBeVisible();
        await expect(
          coffee.getByLabel('Activity title', { exact: true }),
        ).toHaveValue('Saved after retry');
      },
    );
    await coffee
      .getByRole('button', { name: 'Retry saving', exact: true })
      .click();
    await expect(
      coffee.getByRole('heading', { name: 'Saved after retry', exact: true }),
    ).toBeVisible();

    await coffee.getByLabel('Your comment').fill('Sending without waiting');
    await delayed(
      `${base}/comments`,
      'POST',
      async () => {
        await coffee
          .getByRole('button', { name: 'Post comment', exact: true })
          .click();
      },
      async () => {
        await expect(
          coffee.locator('.comment.is-pending .comment-body'),
        ).toHaveText('Sending without waiting');
        await expect(coffee.getByLabel('Your comment')).toHaveValue('');
        await coffee
          .getByLabel('Your comment')
          .fill('The next unfinished draft');
      },
    );
    await expect(coffee.locator('.comment.is-pending')).toHaveCount(0);
    await expect(coffee.getByLabel('Your comment')).toHaveValue(
      'The next unfinished draft',
    );
    await coffee.getByLabel('Your comment').fill('Retry this comment');
    await failing(`${base}/comments`, 'POST', async () => {
      await coffee
        .getByRole('button', { name: 'Post comment', exact: true })
        .click();
      await expect(coffee.getByRole('alert')).toContainText(
        'Temporary test failure',
      );
      await expect(coffee.getByLabel('Your comment')).toHaveValue(
        'Retry this comment',
      );
      await expect(coffee.locator('.comment.is-pending')).toHaveCount(0);
    });
    await coffee.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(coffee.locator('.comment-body')).toHaveText([
      'Sending without waiting',
      'Retry this comment',
    ]);
    await expect(coffee.getByRole('alert')).toHaveCount(0);

    const idea = page.locator(`[data-bookmark-id="${bookmark.id}"]`);
    await idea
      .getByRole('button', { name: 'Edit bookmark title inline', exact: true })
      .click();
    await idea
      .getByLabel('Bookmark title', { exact: true })
      .fill('Museum after lunch');
    await idea.getByLabel('Bookmark title', { exact: true }).press('Enter');
    await expect(
      idea.getByRole('heading', { name: 'Museum after lunch', exact: true }),
    ).toBeVisible();
    await expect(coffee.locator('.card-disclosure')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await coffee
      .getByLabel('Your comment')
      .fill('A draft while editing full details');
    await coffee
      .getByRole('button', {
        name: 'Actions for Saved after retry',
        exact: true,
      })
      .click();
    await coffee
      .getByRole('button', { name: 'Edit details', exact: true })
      .click();
    const fullEdit = page.getByRole('form', {
      name: 'Edit activity',
      exact: true,
    });
    await fullEdit
      .getByLabel('Notes (optional)', { exact: true })
      .fill('Draft notes survive someone else adding a plan.');
    const external = await page.request.post(`${base}/itinerary/activities`, {
      headers,
      data: {
        version: (await read()).version,
        dayDate: '2028-04-02',
        title: 'Another person added a plan',
      },
    });
    expect(external.status()).toBe(201);
    // Live synchronization detects the new revision before a stale form saves.
    await expect(
      fullEdit.getByText(
        'The plan changed while you were editing. Your draft is kept.',
      ),
    ).toBeVisible();
    await expect(
      fullEdit.getByLabel('Notes (optional)', { exact: true }),
    ).toHaveValue('Draft notes survive someone else adding a plan.');
    await fullEdit
      .getByRole('button', { name: 'Review my draft and retry', exact: true })
      .click();
    await fullEdit
      .getByRole('button', { name: 'Save activity', exact: true })
      .click();
    await expect(fullEdit).toHaveCount(0);
    await expect(coffee.getByLabel('Your comment')).toHaveValue(
      'A draft while editing full details',
    );
    await expect(coffee.locator('.card-disclosure')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await page
      .getByRole('tablist', { name: 'Itinerary days' })
      .getByRole('tab')
      .filter({ hasText: '2028-04-02' })
      .click();
    await expect(
      page.getByRole('heading', { name: '2028-04-02', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('tablist', { name: 'Itinerary days' })
      .getByRole('tab')
      .filter({ hasText: '2028-04-01' })
      .click();
    await expect(coffee.locator('.card-disclosure')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(coffee.getByLabel('Your comment')).toHaveValue(
      'A draft while editing full details',
    );

    await page.setViewportSize({ width: 390, height: 900 });
    await expect(
      coffee.getByRole('button', {
        name: 'Reorder Saved after retry',
        exact: true,
      }),
    ).toBeHidden();
    await coffee
      .getByRole('button', {
        name: 'Actions for Saved after retry',
        exact: true,
      })
      .click();
    await coffee
      .getByRole('button', { name: 'Move Saved after retry up', exact: true })
      .click();
    await expect(titles).toHaveText([
      'Beach walk',
      'Saved after retry',
      'Dinner together',
    ]);
    await expect(coffee.locator('.card-disclosure')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect
      .poll(async () =>
        (await read()).days[0].activities.map((item) => item.title),
      )
      .toEqual(['Beach walk', 'Saved after retry', 'Dinner together']);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await coffee
        .locator('.card-detail')
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe('0s');
    await coffee.locator('.card-disclosure').click();
    await expect(coffee.getByLabel('Your comment')).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await expect(titles).toHaveText([
      'Beach walk',
      'Saved after retry',
      'Dinner together',
    ]);
    expect(
      (await read()).days[0].activities.find((item) => item.id === ids[0]),
    ).toMatchObject({
      title: 'Saved after retry',
      startTime: '09:45',
      notes: 'Draft notes survive someone else adding a plan.',
    });
    console.log(
      'PASS: blue accent, desktop top-right drag and drop marker, immediate reorder/votes/comments, failed-save rollback/retry, preserved drafts and focus, inline titles/notes/time, mobile actions, and reduced motion.',
    );
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect((await page.request.delete(base, { headers })).status()).toBe(200);
  }
}
