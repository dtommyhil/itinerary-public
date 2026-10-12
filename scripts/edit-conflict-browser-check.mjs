import { expect } from '@playwright/test';
export async function runEditConflictBrowser(page, origin) {
  const headers = { origin };
  const response = await page.request.post(`${origin}/api/trips`, {
    headers,
    data: {
      name: 'Concurrent editing',
      description: 'Original description',
      timezone: 'UTC',
      startDate: '2028-01-01',
      endDate: '2028-03-30',
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  const base = `${origin}/api/trips/${id}`,
    url = `${origin}/trips/${id}`;
  async function trip() {
    return (await page.request.get(base)).json();
  }
  async function patchTrip(fields) {
    const current = await trip();
    const result = await page.request.patch(base, {
      headers,
      data: { ...current, ...fields },
    });
    expect(result.status()).toBe(200);
  }
  try {
    await page.goto(url + '/edit');
    const form = page.getByRole('form', {
      name: 'Edit trip details',
      exact: true,
    });
    await form.getByLabel('Trip name').fill('My unsent trip name');
    await patchTrip({ description: 'A collaborator changed the description' });
    await form
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(form.getByRole('alert')).toContainText('This trip changed');
    await expect(form.getByLabel('Trip name')).toHaveValue(
      'My unsent trip name',
    );
    await expect(
      form.getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeDisabled();
    await form.getByRole('button', { name: 'Review latest changes' }).click();
    await expect(
      form.getByRole('region', { name: 'Review changed details' }),
    ).toContainText('A collaborator changed the description');
    await form
      .getByRole('button', { name: 'Keep my draft', exact: true })
      .click();
    await patchTrip({ name: 'Someone saved again during review' });
    await form
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(form.getByRole('alert')).toContainText('This trip changed');
    await expect(form.getByLabel('Trip name')).toHaveValue(
      'My unsent trip name',
    );
    await form.getByRole('button', { name: 'Review latest changes' }).click();
    await form
      .getByRole('button', { name: 'Use latest values', exact: true })
      .click();
    await expect(form.getByLabel('Trip name')).toHaveValue(
      'Someone saved again during review',
    );
    await expect(form.getByLabel('Description')).toHaveValue(
      'A collaborator changed the description',
    );
    await form
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(page).toHaveURL(url);
    // Range errors keep the edited form without creating a huge calendar.
    await page.goto(url + '/edit');
    await form.getByLabel('End date', { exact: true }).fill('2028-03-31');
    await form
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(form.getByRole('alert')).toContainText('90 days');
    await expect(form.getByLabel('End date', { exact: true })).toHaveValue(
      '2028-03-31',
    );
    const created = await page.request.post(base + '/bookmarks', {
      headers,
      data: { title: 'Original bookmark', notes: 'Original notes' },
    });
    const { id: bookmarkId } = await created.json();
    const bookmarkUrl = `${base}/bookmarks/${bookmarkId}`;
    async function bookmark() {
      return (await page.request.get(bookmarkUrl)).json();
    }
    async function patchBookmark(fields) {
      const current = await bookmark();
      const response = await page.request.patch(bookmarkUrl, {
        headers,
        data: { ...current, ...fields },
      });
      expect(response.status()).toBe(200);
    }
    await page.goto(url + '/bookmarks');
    const card = page.locator(`[data-bookmark-id="${bookmarkId}"]`);
    await card
      .getByRole('button', { name: 'Expand Original bookmark', exact: true })
      .click();
    await card
      .getByRole('button', { name: 'Edit Original bookmark', exact: true })
      .click();
    const edit = page.getByRole('form', { name: 'Edit bookmark', exact: true });
    await edit.getByLabel('Title', { exact: true }).fill('My bookmark draft');
    await patchBookmark({ notes: 'Someone else saved notes' });
    await edit
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(edit.getByRole('alert')).toContainText(
      'This bookmark changed',
    );
    await expect(edit.getByLabel('Title', { exact: true })).toHaveValue(
      'My bookmark draft',
    );
    await edit.getByRole('button', { name: 'Review latest changes' }).click();
    await expect(
      edit.getByRole('region', { name: 'Review changed details' }),
    ).toContainText('Someone else saved notes');
    await edit
      .getByRole('button', { name: 'Keep my draft', exact: true })
      .click();
    await edit
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(edit).toHaveCount(0);
    expect((await bookmark()).title).toBe('My bookmark draft');
    // Closing the form precedes the server-component refresh. Wait for the
    // confirmed card snapshot before starting a separate concurrent edit.
    await expect(
      card.getByRole('heading', { name: 'My bookmark draft', exact: true }),
    ).toBeVisible();
    // Inline editing captures the old revision; refresh cannot quietly approve the draft.
    await card
      .getByRole('button', { name: 'Edit bookmark title inline' })
      .click();
    await card
      .getByLabel('Bookmark title', { exact: true })
      .fill('My inline draft');
    await patchBookmark({
      title: 'Collaborator title',
      notes: 'Keep these latest notes',
    });
    await card.getByLabel('Bookmark title', { exact: true }).press('Enter');
    await expect(
      card.getByRole('alert').filter({ hasText: 'Latest saved:' }),
    ).toContainText('Collaborator title');
    await expect(
      card.getByLabel('Bookmark title', { exact: true }),
    ).toHaveValue('My inline draft');
    await card
      .getByRole('button', { name: 'Keep my draft', exact: true })
      .click();
    await card.getByLabel('Bookmark title', { exact: true }).press('Enter');
    await expect(
      card.getByRole('heading', { name: 'My inline draft', exact: true }),
    ).toBeVisible();
    expect((await bookmark()).notes).toBe('Keep these latest notes');
    console.log(
      'PASS: retained trip/bookmark drafts, explicit conflict review, second collision during review, latest-value reload, inline conflict resolution, and oversized date input.',
    );
  } finally {
    await page.request.delete(base, { headers });
  }
}
