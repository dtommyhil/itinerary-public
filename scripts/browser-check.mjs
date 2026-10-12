import { artifactPath } from './artifacts.mjs';
import { runReadLinksBrowser } from './read-links-browser-check.mjs';
import { runRealtimeBrowser } from './realtime-browser-check.mjs';
import { runEditConflictBrowser } from './edit-conflict-browser-check.mjs';
import { runUiReferenceBrowser } from './ui-reference-browser-check.mjs';
import { runTripDatesBrowser } from './trip-dates-browser-check.mjs';
import { runUiPolishBrowser } from './ui-polish-browser-check.mjs';
import { runDiscussionBrowser } from './discussion-browser-check.mjs';
import { runItineraryBrowser } from './itinerary-browser-check.mjs';
import { runBookmarksBrowser } from './bookmarks-browser-check.mjs';
import { chromium, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';
export async function runBrowserCheck({
  origin,
  mail,
  mailUrl,
  fixtureEmails,
  collaborator,
}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.111' },
  });
  try {
    const page = await context.newPage();
    const runtimeErrors = [];
    // Screenshots use caret: 'initial' so Playwright doesn't temporarily add
    // inline caret-color styles to inputs while React is hydrating them.
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat/i.test(message.text()))
        runtimeErrors.push(message.text());
    });
    const email = `browser-${randomUUID()}@example.test`;
    fixtureEmails.push(email);
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/', '/login', '/forgot-password']) {
        await page.goto(origin + route);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/login');
    await page
      .getByRole('button', { name: 'New here? Create an account' })
      .click();
    await page.getByLabel('What should we call you?').fill('Browser traveler');
    await page.getByLabel('Email', { exact: true }).fill(email);
    const password = randomBytes(24).toString('hex') + 'A1!';
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill(password + 'x');
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Passwords do not match.' }),
    ).toHaveText('Passwords do not match.');
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'Show password', exact: true })
      .click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
      'type',
      'text',
    );
    const index = mail.length;
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Check your inbox' }),
    ).toBeVisible();
    await expect.poll(() => mail.length).toBeGreaterThan(index);
    await page.goto(mailUrl(index));
    await expect(page).toHaveURL(origin + '/trips');
    await expect(page.getByRole('form', { name: 'Trip details' })).toHaveCount(
      0,
    );
    if (process.env.ITINERARY_UI_REVIEW_ONLY === '1') {
      await runUiReferenceBrowser(page, origin);
      return;
    }
    if (process.env.ITINERARY_POLISH_REVIEW_ONLY === '1') {
      await runUiPolishBrowser(page, origin);
      expect(runtimeErrors).toEqual([]);
      return;
    }
    await runReadLinksBrowser({ page, origin, mail, mailUrl, fixtureEmails });
    const listFixtures = [];
    for (let i = 0; i < 12; i++) {
      const response = await page.request.post(origin + '/api/trips', {
        headers: { origin },
        data: {
          name: `List trip ${i + 1}`,
          timezone: 'UTC',
          ...([2000, 2001, 2099, 2098][i]
            ? {
                startDate: `${[2000, 2001, 2099, 2098][i]}-01-01`,
                endDate: `${[2000, 2001, 2099, 2098][i]}-01-07`,
              }
            : {}),
        },
      });
      expect(response.status()).toBe(201);
      listFixtures.push((await response.json()).id);
    }
    await page.reload();
    const upcomingList = page.getByRole('region', { name: 'Upcoming trips' });
    await expect(upcomingList.locator('strong').first()).toHaveText(
      'List trip 4',
    );
    await expect(upcomingList.locator('strong').nth(1)).toHaveText(
      'List trip 3',
    );
    await expect(
      page.getByRole('region', { name: 'Past trips' }).locator('strong'),
    ).toHaveText(['List trip 2', 'List trip 1']);
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 700 });
      await page.evaluate(() =>
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'instant',
        }),
      );
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
      const header = page.locator('.trips-sticky-header');
      expect((await header.boundingBox()).y).toBe(0);
      const pill = await page
        .getByRole('link', { name: '+ New Trip', exact: true })
        .boundingBox();
      expect(pill.x).toBeCloseTo(Math.max(24, (width - 780) / 2), 0);
      expect(pill.y + pill.height).toBeLessThanOrEqual(700);
      expect(pill.y).toBeGreaterThan(600);
      await expect(
        page.getByRole('heading', { name: 'Trips', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: '+ New Trip', exact: true }),
      ).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        caret: 'initial',
        path: artifactPath(`itinerary-trip-list-${width}.png`),
      });
    }
    for (const id of listFixtures) {
      expect(
        (
          await page.request.delete(origin + '/api/trips/' + id, {
            headers: { origin },
          })
        ).status(),
      ).toBe(200);
    }
    await page.getByRole('link', { name: '+ New Trip', exact: true }).click();
    await expect(page).toHaveURL(origin + '/trips/new');
    const create = page.getByRole('form', { name: 'Trip details' });
    await expect(create.getByLabel('Trip name')).toHaveValue('');
    await expect(
      page.getByRole('heading', {
        name: 'Plans will find their place here.',
        exact: true,
      }),
    ).toBeVisible();
    await create.getByLabel('Trip name').fill('Discarded draft');
    await page.getByRole('link', { name: 'All trips', exact: true }).click();
    await expect(page).toHaveURL(origin + '/trips');
    expect(
      (await (await page.request.get(origin + '/api/trips')).json()).items,
    ).toEqual([]);
    await page.getByRole('link', { name: '+ New Trip', exact: true }).click();
    await expect(create.getByLabel('Trip name')).toHaveValue('');
    await create.getByLabel('Trip name').fill('Refresh discards draft');
    await page.reload();
    await expect(create.getByLabel('Trip name')).toHaveValue('');

    await page.screenshot({
      caret: 'initial',
      path: artifactPath('itinerary-new-trip.png'),
      fullPage: true,
    });
    await create.getByLabel('Trip name').fill('Browser trip');
    await create.getByLabel('Description').fill('A week of exploring together');
    await create.getByLabel('Start date').fill('2028-04-01');
    await create.getByLabel('End date').fill('2028-04-07');
    await create
      .getByLabel('Timezone', { exact: true })
      .selectOption('Asia/Tokyo');
    await expect(create.getByLabel('HTTPS link')).toHaveCount(0);
    await create.getByRole('button', { name: 'Add link', exact: true }).click();
    await create.getByLabel('Name · optional').fill('Our photos');
    await create.getByLabel('HTTPS link').fill('https://example.test/photos');
    await create.getByRole('button', { name: 'Add link', exact: true }).click();
    await create.getByLabel('Name · optional').nth(1).fill('Travel plans');
    await create
      .getByLabel('HTTPS link')
      .nth(1)
      .fill('https://example.test/plans');
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }

    expect(
      await create.locator(':invalid').evaluateAll((inputs) =>
        inputs.map((input) => ({
          name: input.getAttribute('name'),
          message: input.validationMessage,
        })),
      ),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Save trip', exact: true }).click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+$/);
    await expect(
      page
        .getByRole('paragraph')
        .filter({ hasText: 'A week of exploring together' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Itinerary',
        exact: true,
      }),
    ).toBeVisible();
    const createdTrip = await (
      await page.request.get(page.url().replace('/trips/', '/api/trips/'))
    ).json();
    expect(createdTrip).toMatchObject({
      description: 'A week of exploring together',
      link: 'https://example.test/photos',
      links: [
        { label: 'Our photos', url: 'https://example.test/photos' },
        { label: 'Travel plans', url: 'https://example.test/plans' },
      ],
      startDate: '2028-04-01',
      endDate: '2028-04-07',
      timezone: 'Asia/Tokyo',
    });
    await page
      .getByRole('button', { name: 'Trip options', exact: true })
      .click();
    await page.getByText('Edit trip details', { exact: true }).click();
    await expect(
      page.getByRole('form', { name: 'Edit trip details', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Trip name').fill('Browser trip updated');
    await page.getByLabel('Start date').fill('2028-04-01');
    await page.getByLabel('End date').fill('2028-04-07');
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Browser trip updated', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Browser trip updated', exact: true }),
    ).toBeVisible();
    const tripUrl = page.url();
    await expect(
      page.getByRole('link', { name: /Our photos/ }),
    ).toHaveAttribute('href', 'https://example.test/photos');
    const people = page.getByRole('button', {
      name: 'People on this trip',
      exact: true,
    });
    await people.focus();
    await expect(people).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('region', { name: 'People on this trip', exact: true }),
    ).toContainText(email);
    await page.keyboard.press('Escape');
    await expect(people).toHaveAttribute('aria-expanded', 'false');
    await people.click();
    await expect(people).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('heading', { name: 'Browser trip updated', exact: true })
      .click();
    await expect(people).toHaveAttribute('aria-expanded', 'false');
    const bookmarksToggle = page.getByRole('button', {
      name: /Bookmarks Ideas for the trip/,
    });
    await expect(bookmarksToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('button', { name: 'Add bookmark', exact: true }),
    ).toBeVisible();
    await bookmarksToggle.click();
    await expect(bookmarksToggle).toHaveAttribute('aria-expanded', 'true');
    await bookmarksToggle.click();
    await expect(bookmarksToggle).toHaveAttribute('aria-expanded', 'false');
    await runEditConflictBrowser(page, origin);
    await runTripDatesBrowser(page, origin);
    await runUiPolishBrowser(page, origin);
    await runUiReferenceBrowser(page, origin);
    await runBookmarksBrowser(page, tripUrl);
    await runItineraryBrowser(page, tripUrl);
    await runDiscussionBrowser(page, tripUrl);
    await runRealtimeBrowser(page, origin, collaborator, tripUrl);
    const inviteIndex = mail.length;
    const shareButton = page.getByRole('button', {
      name: 'Share trip',
      exact: true,
    });
    await shareButton.click();
    await expect(
      page.getByRole('dialog', { name: 'Share this trip', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(shareButton).toBeFocused();
    await shareButton.click();
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.getByRole('dialog').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: width === 1024 ? 600 : 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const dialog = page.getByRole('dialog');
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const close = await page
        .getByRole('button', { name: 'Close sharing' })
        .boundingBox();
      expect(close.width).toBeGreaterThanOrEqual(44);
      expect(close.height).toBeGreaterThanOrEqual(44);
      await dialog.screenshot({
        caret: 'initial',
        path: artifactPath(`itinerary-share-${width}.png`),
      });
    }
    // Mock only the OS share sheet; verify the actual button supplies the trip link.
    await page.evaluate(() => {
      window.sharedTrip = null;
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data) => {
          window.sharedTrip = data;
        },
      });
    });
    await page.getByText('More sharing options', { exact: true }).click();
    await page.getByRole('button', { name: 'Share link', exact: true }).click();
    expect(await page.evaluate(() => window.sharedTrip.url)).toBe(tripUrl);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('dialog').screenshot({
      caret: 'initial',
      path: artifactPath('itinerary-share-dialog.png'),
    });
    await page
      .getByLabel('Email addresses', { exact: true })
      .fill(collaborator.email);
    await page.getByLabel('Trip role', { exact: true }).selectOption('viewer');
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect.poll(() => mail.length).toBeGreaterThan(inviteIndex);
    const invitee = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      await invitee.addCookies(
        collaborator.cookie.split('; ').map((part) => {
          const index = part.indexOf('=');
          return {
            name: part.slice(0, index),
            value: part.slice(index + 1),
            url: origin,
          };
        }),
      );
      const guest = await invitee.newPage();
      await guest.goto(mailUrl(inviteIndex));
      expect(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await guest.getByRole('button', { name: 'Accept invitation' }).click();
      await expect(guest).toHaveURL(tripUrl);
      await expect(
        guest.getByText('Edit trip details', { exact: true }),
      ).toHaveCount(0);
      await guest.goto(tripUrl + '/bookmarks');
      await expect(
        guest.getByRole('button', { name: 'Add bookmark', exact: true }),
      ).toHaveCount(0);
      const guestDiscussion = guest.locator('.card-discussion').first();
      await guestDiscussion
        .getByRole('button', { name: 'Comments for Museum option' })
        .click();
      await expect(guestDiscussion.locator('.comment-body')).toHaveText(
        'Meet by the entrance',
      );
      await expect(guestDiscussion.getByLabel('Your comment')).toHaveCount(0);
      await expect(
        guestDiscussion.getByRole('button', { name: 'I’m interested' }),
      ).toBeDisabled();
      await expect(
        guestDiscussion.getByRole('button', { name: 'Delete comment' }),
      ).toHaveCount(0);
      await context.clearCookies();
      await page.goto(tripUrl);
      await expect(page).toHaveURL(new RegExp('/login\\?next='));
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(tripUrl);
      await shareButton.click();
      await page
        .getByLabel('Access for Trip collaborator')
        .selectOption('editor');
      await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
        'Sharing updated.',
      );
      await guest.reload();
      await expect(
        guest.getByRole('button', { name: 'Add bookmark', exact: true }),
      ).toBeVisible();
      await guestDiscussion
        .getByRole('button', { name: 'Comments for Museum option' })
        .click();
      await expect(guestDiscussion.getByLabel('Your comment')).toBeVisible();
      await expect(
        guestDiscussion.getByRole('button', {
          name: 'Edit comment',
          exact: true,
        }),
      ).toHaveCount(0);
      await guestDiscussion
        .getByRole('button', { name: 'I’m interested', exact: true })
        .click();
      await expect(
        guestDiscussion.getByText('2 interested', { exact: true }),
      ).toBeVisible();
      page.once('dialog', (dialog) => dialog.accept());
      await page
        .getByLabel('Access for Trip collaborator')
        .selectOption('transfer');
      await page.getByRole('button', { name: 'Close sharing' }).click();
      await page.getByRole('button', { name: 'Trip options' }).click();
      await expect(
        page.getByText('Edit trip details', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Close trip options' }).click();
      await guest.goto(tripUrl);
      await guest.getByRole('button', { name: 'Trip options' }).click();
      await guest
        .getByRole('button', { name: 'Delete trip', exact: true })
        .click();
      guest.once('dialog', (dialog) => dialog.accept());
      await guest
        .getByRole('button', { name: 'Delete trip permanently' })
        .click();
      await expect(guest).toHaveURL(origin + '/trips');
    } finally {
      await invitee.close();
    }
    expect(runtimeErrors).toEqual([]);
    console.log(
      'PASS: Chromium signup, display name, password confirmation/visibility, email verification, create/edit trip, email invitation acceptance, viewer/editor controls, ownership transfer, and deletion UI.',
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
