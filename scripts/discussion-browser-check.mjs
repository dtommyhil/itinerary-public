import { artifactPath } from './artifacts.mjs';
import { expect } from '@playwright/test';
export async function runDiscussionBrowser(page, tripUrl) {
  await page.goto(tripUrl + '/bookmarks');
  const card = page.locator('.bookmark-card').filter({
    has: page.getByRole('heading', { name: 'Museum option', exact: true }),
  });
  const panel = card.locator('.card-discussion');
  await expect(card.locator('.card-disclosure')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await panel
    .getByRole('button', { name: 'I’m interested', exact: true })
    .click();
  await expect(card.locator('.card-disclosure')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await panel
    .getByRole('button', { name: 'Remove my vote', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Comments for Museum option' })
    .click();
  await expect(
    panel.getByText('Start the conversation.', {
      exact: true,
    }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'I’m interested', exact: true })
    .click();
  await expect(panel.getByText('1 interested', { exact: true })).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Remove my vote' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await panel
    .getByLabel('Your comment', { exact: true })
    .fill('Unfinished draft');
  await card.locator('.card-disclosure').click();
  await expect(panel.getByLabel('Your comment')).toBeHidden();
  await panel
    .getByRole('button', { name: 'Comments for Museum option' })
    .click();
  await expect(panel.getByLabel('Your comment')).toBeFocused();
  await expect(panel.getByLabel('Your comment')).toHaveValue(
    'Unfinished draft',
  );
  const text = '<img src=x onerror=alert(1)> Let’s go here';
  await panel.getByLabel('Your comment', { exact: true }).fill(text);
  await panel
    .getByRole('button', { name: 'Post comment', exact: true })
    .click();
  await expect(panel.locator('.comment-body')).toHaveText(text);
  await expect(panel.locator('.comment-body img')).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Edit comment', exact: true })
    .click();
  const edit = panel.getByRole('form', { name: 'Edit comment', exact: true });
  await edit
    .getByLabel('Edit comment', { exact: true })
    .fill('Meet by the entrance');
  await edit.getByRole('button', { name: 'Save comment', exact: true }).click();
  await expect(panel.locator('.comment-body')).toHaveText(
    'Meet by the entrance',
  );
  await expect(edit).toHaveCount(0);
  await page.reload();
  await panel
    .getByRole('button', { name: 'Comments for Museum option' })
    .click();
  await expect(panel.locator('.comment-body')).toHaveText(
    'Meet by the entrance',
  );
  await expect(
    panel.getByRole('button', { name: 'Remove my vote' }),
  ).toHaveAttribute('aria-pressed', 'true');
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      caret: 'initial',
      path: artifactPath(`itinerary-discussion-${width}.png`),
    });
  }
  // Keep this comment/vote for the viewer/editor browser-context checks.
  await page.goto(tripUrl);
  const activity = page.locator('.activity-card').filter({
    has: page.getByRole('heading', {
      name: 'Breakfast together',
      exact: true,
    }),
  });
  const discussion = activity.locator('.card-discussion');
  await discussion
    .getByRole('button', { name: 'Comments for Breakfast together' })
    .click();
  await discussion
    .getByLabel('Your comment', { exact: true })
    .fill('Activity comment');
  await discussion
    .getByRole('button', { name: 'Post comment', exact: true })
    .click();
  await expect(discussion.locator('.comment-body')).toHaveText(
    'Activity comment',
  );
  page.once('dialog', (d) => d.accept());
  const deleted = page.waitForResponse(
    (response) =>
      response.url().includes('/comments/') &&
      response.request().method() === 'DELETE' &&
      response.status() === 200,
  );
  await discussion
    .getByRole('button', { name: 'Delete comment', exact: true })
    .click();
  await expect(
    discussion.getByText('Start the conversation.', {
      exact: true,
    }),
  ).toBeVisible();
  await deleted;
  const feed = page.getByRole('region', { name: 'Trip activity', exact: true });
  await feed.locator('summary').click();
  await expect(
    feed.locator('li').filter({ hasText: 'removed a comment' }),
  ).toHaveCount(1);
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto(tripUrl);
  console.log(
    'PASS: browser comment creation/edit/removal, plain-text rendering, persistent votes, bookmark/activity discussions, mobile layout and history.',
  );
}
