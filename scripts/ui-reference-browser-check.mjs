import { artifactPath } from './artifacts.mjs';
import { writeFileSync } from 'node:fs';
import { expect } from '@playwright/test';

// Temporary real-data fixture based on the supplied UI reference. No demo auth.
export async function runUiReferenceBrowser(page, origin) {
  const response = await page.request.post(`${origin}/api/trips`, {
    headers: { origin },
    data: {
      name: 'a week in hawaii',
      description: 'Good food, salty hair, and no rush. Just us on Oʻahu.',
      startDate: '2027-04-06',
      endDate: '2027-04-13',
      timezone: 'Pacific/Honolulu',
      links: [
        { label: 'Our shared photo folder', url: 'https://drive.google.com/' },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  const tripUrl = `${origin}/trips/${id}`;
  const base = `${origin}/api/trips/${id}`;
  let version = 0;
  let selectedDay;
  try {
    for (let date = 6; date <= 13; date++) {
      const created = await page.request.post(`${base}/itinerary/days`, {
        headers: { origin },
        data: { date: `2027-04-${String(date).padStart(2, '0')}`, version },
      });
      expect(created.status()).toBe(201);
      if (date === 9) selectedDay = (await created.json()).id;
      version++;
    }
    const activities = [
      [
        'breakfast at island vintage coffee',
        'Açaí bowls and iced coffee before we head to the beach. Meet downstairs at 8:45. Bring a little extra time for a walk together along the water before we leave.',
        '09:00',
      ],
      [
        'a slow morning at kailua beach',
        'Bring a towel, reef-safe sunscreen, and something to read. We can rent kayaks if we feel like it.',
        '10:30',
      ],
      [
        'snorkeling at hanauma bay',
        'Bring swimsuits and water. Reservation is for 3:00 PM; leave Kailua by 1:45. We’ll share two cars.',
        '15:00',
      ],
      [
        'dinner at duke’s',
        'A relaxed dinner by the water. Reservation under Mia for four.',
        '18:30',
      ],
    ];
    for (const [title, notes, startTime] of activities) {
      expect(
        (
          await page.request.post(`${base}/itinerary/activities`, {
            headers: { origin },
            data: { dayId: selectedDay, title, notes, startTime, version },
          })
        ).status(),
      ).toBe(201);
      version++;
    }
    expect(
      (
        await page.request.post(`${base}/bookmarks`, {
          headers: { origin },
          data: {
            title: 'ho‘omaluhia botanical garden',
            notes: 'A quiet morning among the mountains.',
            category: 'attraction',
          },
        })
      ).status(),
    ).toBe(201);
    await page.goto(`${tripUrl}?day=${selectedDay}`);
    // Exercise a real handler before screenshots temporarily hide input carets.
    // Capturing pre-hydration HTML can itself introduce a React style mismatch.
    const addTrigger = page.getByRole('button', {
      name: 'Add to trip',
      exact: true,
    });
    await addTrigger.click();
    await expect(addTrigger).toHaveAttribute('aria-expanded', 'true');
    await addTrigger.click();
    await expect(addTrigger).toHaveAttribute('aria-expanded', 'false');
    const card = page.locator('.activity-card').first();
    const summary = card.locator('.card-disclosure');
    const preview = card.locator('.card-preview');
    const layoutMetrics = {};
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        caret: 'initial',
        path: artifactPath(`itinerary-reference-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal { display: none !important; }',
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      layoutMetrics[width] = await page.evaluate(() =>
        Object.fromEntries(
          [
            '.trip-head',
            '.datebar',
            '.main',
            '.day-heading',
            '.activity .card-toggle',
            '.activity .action-row',
            '.bookmarks-card',
          ].map((selector) => {
            const el = document.querySelector(selector);
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return [
              selector,
              {
                x: r.x + scrollX,
                y: r.y + scrollY,
                width: r.width,
                height: r.height,
                font: s.font,
                padding: s.padding,
                margin: s.margin,
              },
            ];
          }),
        ),
      );
      const before = await preview.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, height: r.height };
      });
      await summary.click();
      await expect(card.getByLabel('Your comment')).toBeVisible();
      const after = await preview.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, height: r.height };
      });
      expect(after.x).toBeCloseTo(before.x, 0);
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(after.height).toBeGreaterThanOrEqual(before.height);
      await page.screenshot({
        caret: 'initial',
        path: artifactPath(`itinerary-reference-expanded-${width}.png`),
        fullPage: true,
        style: 'nextjs-portal { display: none !important; }',
      });
      await summary.click();
      await expect(card.locator('.card-detail')).toBeHidden();
    }
    writeFileSync(
      artifactPath('itinerary-ui-inspect/app-metrics.json'),
      JSON.stringify(layoutMetrics, null, 2),
    );
    await page.evaluate(() =>
      window.scrollTo({ top: 600, behavior: 'instant' }),
    );
    await expect
      .poll(async () => (await page.locator('.itinerary-days').boundingBox()).y)
      .toBeCloseTo(0, 0);
    await page
      .getByRole('button', { name: 'Add to trip', exact: true })
      .click();
    await expect(
      page
        .locator('.quick-add-options')
        .getByRole('button', { name: 'Add activity' })
        .locator('svg'),
    ).toBeVisible();
    await expect(
      page
        .locator('.quick-add-options')
        .getByRole('button', { name: 'Add bookmark' })
        .locator('svg'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.quick-add-options')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add to trip' }).click();
    await page
      .locator('.quick-add-options')
      .getByRole('button', { name: 'Add activity' })
      .click();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const dialog = page.getByRole('dialog', {
        name: 'Add activity',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await dialog.screenshot({
        caret: 'initial',
        path: artifactPath(
          `itinerary-ui-inspect/app-activity-dialog-${width}.png`,
        ),
      });
    }
    await page.getByRole('button', { name: 'Close add activity' }).click();
    await page
      .getByRole('button', { name: 'Add bookmark', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Add bookmark', exact: true })
      .screenshot({
        caret: 'initial',
        path: artifactPath('itinerary-ui-inspect/app-bookmark-dialog.png'),
      });
    await page.getByRole('button', { name: 'Close add bookmark' }).click();
    await page.getByRole('button', { name: 'Share trip' }).click();
    await page
      .getByRole('dialog', { name: 'Share this trip', exact: true })
      .screenshot({
        caret: 'initial',
        path: artifactPath('itinerary-ui-inspect/app-share-dialog.png'),
      });
    await page.getByRole('button', { name: 'Close sharing' }).click();
    await page.getByRole('button', { name: 'Trip options' }).click();
    await page
      .getByRole('link', { name: 'Edit trip details', exact: true })
      .click();
    const edit = page.getByRole('form', {
      name: 'Edit trip details',
      exact: true,
    });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        caret: 'initial',
        path: artifactPath(`itinerary-ui-inspect/app-editor-${width}.png`),
        fullPage: true,
      });
    }
    await edit
      .getByRole('button', { name: 'Remove link Our shared photo folder' })
      .click();
    await edit
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(page.locator('.trip-links a')).toHaveCount(0);
    await expect(page).toHaveURL(`${tripUrl}?day=${selectedDay}`);
    expect((await (await page.request.get(base)).json()).links).toEqual([]);
    console.log(
      'PASS: reference layout at 320/390/768/1280px, description position during expansion, sticky day strip, floating menu, and named-link removal.',
    );
  } finally {
    expect(
      (await page.request.delete(base, { headers: { origin } })).status(),
    ).toBe(200);
  }
}
