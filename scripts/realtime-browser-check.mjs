import { expect } from '@playwright/test';

export async function runRealtimeBrowser(
  page,
  origin,
  collaborator,
  returnUrl,
) {
  const guestContext = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
    });
  const errors = [];
  await guestContext.addCookies(
    collaborator.cookie.split('; ').map((part) => {
      const index = part.indexOf('=');
      return {
        name: part.slice(0, index),
        value: part.slice(index + 1),
        url: origin,
      };
    }),
  );
  await guestContext.addInitScript(() => {
    // Track genuine browser sockets only to simulate transport loss/reordered hints.
    const NativeSocket = window.WebSocket;
    window.__liveTestSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes('/live/trips/'))
          window.__liveTestSockets.push(this);
      }
    };
  });
  const guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(error.message));
  guest.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text()))
      errors.push(message.text());
  });
  const headers = { origin };
  const created = await page.request.post(`${origin}/api/trips`, {
    headers,
    data: {
      name: 'Live group weekend',
      timezone: 'UTC',
      startDate: '2028-04-01',
      endDate: '2028-04-02',
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const base = `${origin}/api/trips/${id}`;
  const url = `${origin}/trips/${id}`;
  const read = async () => (await page.request.get(`${base}/itinerary`)).json();
  try {
    const share = await page.request.post(`${base}/read-link`, { headers });
    expect(share.status()).toBe(201);
    const { path } = await share.json();
    expect(
      (await guest.request.post(`${origin}/api${path}`, { headers })).status(),
    ).toBe(200);
    const identity = await (
      await guest.request.get(`${origin}/api/auth/get-session`)
    ).json();
    expect(
      (
        await page.request.post(`${base}/members`, {
          headers,
          data: { action: 'role', userId: identity.user.id, role: 'editor' },
        })
      ).status(),
    ).toBe(200);
    await Promise.all([page.goto(url), guest.goto(url)]);
    await guest
      .getByRole('button', { name: 'Add to trip', exact: true })
      .click();
    await guest
      .locator('.quick-add-options')
      .getByRole('button', { name: 'Add activity', exact: true })
      .click();
    const add = guest.getByRole('form', { name: 'Add activity', exact: true });
    await add.getByLabel('Activity title').fill('Coffee together');
    await add.getByLabel('Notes (optional)').fill('Meet in the lobby');
    await add
      .getByRole('button', { name: 'Add activity', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Coffee together', exact: true }),
    ).toBeVisible({ timeout: 10000 });
    const activityId = (await read()).days[0].activities[0].id;
    const card = page.locator(`[data-activity-id="${activityId}"]`);
    await card
      .getByRole('button', { name: 'Expand Coffee together', exact: true })
      .click();
    await card
      .getByRole('button', { name: 'Edit notes inline', exact: true })
      .click();
    const notes = card.getByLabel('Notes', { exact: true });
    await notes.fill('My unfinished travel notes');
    expect(
      (
        await guest.request.patch(
          `${base}/itinerary/activities/${activityId}`,
          {
            headers,
            data: {
              version: (await read()).version,
              dayId: (await read()).days[0].id,
              title: 'Coffee by the beach',
              notes: 'Bring sunscreen',
            },
          },
        )
      ).status(),
    ).toBe(200);
    await expect(
      card.getByRole('heading', { name: 'Coffee by the beach', exact: true }),
    ).toBeVisible();
    await expect(notes).toHaveValue('My unfinished travel notes');
    await expect(card.locator('.edit-conflict')).toContainText(
      'Bring sunscreen',
    );
    await card
      .getByRole('button', { name: 'Keep my draft', exact: true })
      .click();
    await card.getByRole('button', { name: 'Save edit', exact: true }).click();
    await expect(notes).toHaveCount(0);
    expect((await read()).days[0].activities[0]).toMatchObject({
      title: 'Coffee by the beach',
      notes: 'My unfinished travel notes',
    });
    await card.getByLabel('Your comment').fill('Unsent comment stays here');

    await guest.evaluate(() => window.__liveTestSockets.at(-1).close());
    expect(
      (
        await page.request.post(`${base}/itinerary/activities`, {
          headers,
          data: {
            version: (await read()).version,
            dayDate: '2028-04-01',
            title: 'After reconnect',
          },
        })
      ).status(),
    ).toBe(201);
    await expect(
      guest.getByRole('heading', { name: 'After reconnect', exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect
      .poll(() => guest.evaluate(() => window.__liveTestSockets.length))
      .toBeGreaterThan(1);
    await expect(card.getByLabel('Your comment')).toHaveValue(
      'Unsent comment stays here',
    );
    await guest.evaluate(() => {
      const socket = window.__liveTestSockets.at(-1);
      for (const data of [
        '{',
        JSON.stringify({
          type: 'itinerary.changed',
          version: 0,
          role: 'editor',
        }),
      ])
        socket.dispatchEvent(new MessageEvent('message', { data }));
    });
    await expect(
      guest.getByRole('heading', { name: 'After reconnect', exact: true }),
    ).toBeVisible();

    expect(
      (
        await page.request.post(`${base}/members`, {
          headers,
          data: { action: 'role', userId: identity.user.id, role: 'viewer' },
        })
      ).status(),
    ).toBe(200);
    await expect(
      guest.getByRole('button', {
        name: 'Edit activity title inline',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.post(`${base}/members`, {
          headers,
          data: { action: 'remove', userId: identity.user.id },
        })
      ).status(),
    ).toBe(200);
    await expect(guest).toHaveURL(`${origin}/trips`);
    expect((await guest.request.get(`${base}/itinerary`)).status()).toBe(404);
    expect(errors).toEqual([]);
    console.log(
      'PASS: two-browser live itinerary creation/edits, inline conflict review, retained notes/comments, reconnect snapshots, malformed/stale hints, live role downgrade and member removal.',
    );
  } finally {
    await guestContext.close();
    await page.request.delete(base, { headers });
    await page.goto(returnUrl);
  }
}
