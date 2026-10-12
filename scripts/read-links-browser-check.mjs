import { expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

export async function runReadLinksBrowser({
  page,
  origin,
  mail,
  mailUrl,
  fixtureEmails,
}) {
  const headers = { origin };
  const created = await page.request.post(`${origin}/api/trips`, {
    headers,
    data: { name: 'Sharing a trip with friends', timezone: 'UTC' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const base = `${origin}/api/trips/${id}`,
    tripUrl = `${origin}/trips/${id}`;
  const guestContext = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.112' },
    });
  try {
    await page.goto(tripUrl);
    await page.getByRole('button', { name: 'Share trip', exact: true }).click();
    const sharing = page.getByRole('dialog', {
      name: 'Share this trip',
      exact: true,
    });
    await sharing
      .getByRole('button', { name: 'Create read-only link', exact: true })
      .click();
    const input = sharing.getByLabel('Read-only link', { exact: true });
    await expect(input).toBeVisible();
    const link = await input.inputValue();
    const pathname = new URL(link).pathname;
    const guest = await guestContext.newPage();
    await guest.goto(link);
    await expect(guest).toHaveURL(
      origin + '/login?next=' + encodeURIComponent(pathname),
    );
    // Real signup and email verification must return the recipient to this link.
    await guest
      .getByRole('button', { name: 'New here? Create an account' })
      .click();
    const email = `read-link-browser-${randomUUID()}@example.test`;
    fixtureEmails.push(email);
    await guest
      .getByLabel('What should we call you?')
      .fill('Read-only traveler');
    await guest.getByLabel('Email', { exact: true }).fill(email);
    const password = randomBytes(24).toString('hex') + 'A1!';
    await guest.getByLabel('Password', { exact: true }).fill(password);
    await guest.getByLabel('Confirm password', { exact: true }).fill(password);
    const index = mail.length;
    await guest
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(
      guest.getByRole('heading', { name: 'Check your inbox' }),
    ).toBeVisible();
    await expect.poll(() => mail.length).toBeGreaterThan(index);
    await guest.goto(mailUrl(index));
    await expect(guest).toHaveURL(link);
    await expect(guest.locator('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );
    await guest
      .getByRole('button', { name: 'Join as viewer', exact: true })
      .click();
    await expect(guest).toHaveURL(tripUrl);
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await (await guest.request.get(base)).json()).role).toBe('viewer');
    expect(
      (
        await guest.request.post(base + '/bookmarks', {
          headers,
          data: { title: 'A viewer cannot save this' },
        })
      ).status(),
    ).toBe(403);
    await guest
      .getByRole('button', { name: 'Share trip', exact: true })
      .click();
    const guestSharing = guest.getByRole('dialog', {
      name: 'Share this trip',
      exact: true,
    });
    await expect(
      guestSharing.getByRole('button', { name: 'Create read-only link' }),
    ).toHaveCount(0);
    await expect(
      guestSharing.getByRole('button', { name: 'Disable read-only link' }),
    ).toHaveCount(0);
    await guest.keyboard.press('Escape');
    // Existing owners retain their role when accepting the same viewer link.
    await page.goto(link);
    await page
      .getByRole('button', { name: 'Join as viewer', exact: true })
      .click();
    await expect(page).toHaveURL(tripUrl);
    expect((await (await page.request.get(base)).json()).role).toBe('owner');
    await page.getByRole('button', { name: 'Share trip', exact: true }).click();
    await sharing
      .getByRole('button', { name: 'Disable read-only link', exact: true })
      .click();
    await expect(sharing.getByRole('status')).toHaveText('Sharing updated.');
    // Revoking a link closes new admission, not existing member access.
    expect((await guest.request.get(base)).status()).toBe(200);
    await guest.goto(link);
    await guest
      .getByRole('button', { name: 'Join as viewer', exact: true })
      .click();
    await expect(guest.getByRole('main').getByRole('alert')).toHaveText(
      'Invitation expired or revoked',
    );
    const session = await (
      await guest.request.get(`${origin}/api/auth/get-session`)
    ).json();
    expect(
      (
        await page.request.post(base + '/members', {
          headers,
          data: { action: 'role', userId: session.user.id, role: 'editor' },
        })
      ).status(),
    ).toBe(200);
    await guest.goto(tripUrl);
    await guest
      .getByRole('button', { name: 'Share trip', exact: true })
      .click();
    await guestSharing
      .getByRole('button', { name: 'Create read-only link', exact: true })
      .click();
    await expect(
      guestSharing.getByLabel('Read-only link', { exact: true }),
    ).toBeVisible();
    await expect(
      guestSharing.getByRole('button', { name: 'Disable read-only link' }),
    ).toHaveCount(0);
    const editorLink = await guestSharing
      .getByLabel('Read-only link', { exact: true })
      .inputValue();
    expect(
      (
        await page.request.post(base + '/members', {
          headers,
          data: { action: 'remove', userId: session.user.id },
        })
      ).status(),
    ).toBe(200);
    expect((await guest.request.get(base)).status()).toBe(404);
    await guest.goto(editorLink);
    await guest
      .getByRole('button', { name: 'Join as viewer', exact: true })
      .click();
    await expect(guest.getByRole('main').getByRole('alert')).toHaveText(
      'Invitation expired or revoked',
    );
    expect((await guest.request.get(base)).status()).toBe(404);
    console.log(
      'PASS: read-only link creation, sign-in/signup/verification return, viewer access, existing owner preservation, revocation feedback, editor sharing, and removed-member reentry denial.',
    );
  } finally {
    await guestContext.close();
    await page.request.delete(base, { headers });
    await page.goto(origin + '/trips');
  }
}
