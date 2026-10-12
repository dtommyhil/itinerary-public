import { runReadLinks } from './read-links-check.mjs';
import { runRealtime } from './realtime-check.mjs';
import { runEditConflicts } from './edit-conflict-check.mjs';
import { runDiscussion } from './discussion-check.mjs';
import { runItinerary } from './itinerary-check.mjs';
import { runBookmarks } from './bookmarks-check.mjs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
export async function runCollaboration({
  db,
  post,
  origin,
  mail,
  mailUrl,
  fixtureEmails,
  getCookie,
  setCookie,
  captureCookies,
}) {
  const ownerCookie = getCookie();
  const owner = await (
    await fetch(origin + '/api/auth/get-session', {
      headers: { cookie: ownerCookie },
    })
  ).json();
  const emails = [
    `editor-${randomUUID()}@example.test`,
    `viewer-${randomUUID()}@example.test`,
  ];
  fixtureEmails.push(...emails);
  const cookies = [];
  const userIds = [];
  for (const email of emails) {
    setCookie('');
    const index = mail.length;
    const response = await post('/api/auth/sign-up/email', {
      name: 'Trip collaborator',
      email,
      password: randomBytes(24).toString('hex') + 'A1!',
      callbackURL: '/trips',
    });
    assert.equal(response.status, 200);
    userIds.push((await response.json()).user.id);
    for (let i = 0; i < 40 && mail.length <= index; i++) await delay(250);
    assert(mail[index]);
    const verified = await fetch(mailUrl(index), { redirect: 'manual' });
    assert.equal(verified.status, 302);
    captureCookies(verified);
    cookies.push(getCookie());
  }
  setCookie(ownerCookie);
  const created = await post('/api/trips', {
    name: 'Collaboration fixture',
    timezone: 'UTC',
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const base = `/api/trips/${id}`;
  async function read(path, cookie = getCookie()) {
    return fetch(origin + path, { headers: { cookie } });
  }
  assert.equal((await read('/api/trips', '')).status, 401);
  assert.equal((await read(base, '')).status, 401);
  assert.equal((await read('/api/trips?limit=101')).status, 400);
  assert.equal((await read('/api/trips?cursor=invalid')).status, 400);
  assert.equal((await read('/api/trips/not-a-uuid')).status, 404);
  const listedIds = [];
  let cursor;
  do {
    const response = await read(
      '/api/trips?limit=1' + (cursor ? `&cursor=${cursor}` : ''),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const page = await response.json();
    assert(page.items.length <= 1);
    for (const trip of page.items) {
      assert(!listedIds.includes(trip.id), 'Pagination must not repeat trips');
      assert.equal(trip.role, 'owner');
      listedIds.push(trip.id);
    }
    cursor = page.nextCursor;
    assert(
      listedIds.length < 20,
      'Pagination must terminate for test fixtures',
    );
  } while (cursor);
  const expectedTrips = await db.query(
    'SELECT "tripId" FROM "TripMember" WHERE "userId"=$1 ORDER BY "tripId"',
    [owner.user.id],
  );
  assert.deepEqual(
    listedIds,
    expectedTrips.rows.map((row) => row.tripId),
  );
  assert.equal(
    (await read(base, cookies[0])).status,
    404,
    'Private trip hidden from nonmember',
  );
  assert.deepEqual(
    (await (await read('/api/trips', cookies[0])).json()).items,
    [],
  );
  const csrf = await fetch(origin + '/api/trips', {
    method: 'POST',
    headers: {
      cookie: ownerCookie,
      origin: 'https://untrusted.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Blocked', timezone: 'UTC' }),
  });
  assert.equal(csrf.status, 403, 'Cross-origin trip creation rejected');
  const details = {
    name: 'Updated collaboration trip',
    description: 'A shared plan',
    link: 'https://drive.google.com/drive/folders/trip-photos',
    timezone: 'America/Denver',
    startDate: '2028-02-28',
    endDate: '2028-02-29',
  };
  assert.equal((await post(base, details, 'PATCH')).status, 200);
  const fetched = await (await read(base)).json();
  assert.deepEqual(fetched, {
    version: 1,
    id,
    ...details,
    links: [{ label: '', url: details.link }],
    role: 'owner',
  });
  assert.equal(
    (await read(base)).headers.get('cache-control'),
    'private, no-store',
  );
  assert.equal(
    (await post(base, { ...details, endDate: '2028-02-27' }, 'PATCH')).status,
    400,
  );
  assert.equal(
    (await post(base + '/members', { action: 'leave' })).status,
    409,
  );
  assert.equal(
    (await post(base + '/members', { action: 'remove', userId: owner.user.id }))
      .status,
    409,
  );
  const invited = await post(base + '/invitations', {
    email: emails[0],
    role: 'editor',
  });
  assert.equal(invited.status, 201);
  const invite = await invited.json();
  assert.equal(invite.delivered, true, 'Invitation captured by local SMTP');
  assert.equal(
    (await post(`/api/invitations/${invite.id}/accept`)).status,
    404,
    'Wrong email cannot accept',
  );
  assert.equal(
    (await post(base + '/invitations', { email: emails[0], role: 'editor' }))
      .status,
    409,
    'Resend cooldown',
  );
  setCookie(cookies[0]);
  assert.equal(
    (await post(base, details, 'PATCH')).status,
    404,
    'Nonmembers cannot modify trip',
  );
  assert.equal(
    (await post(`/api/invitations/${invite.id}/accept`)).status,
    200,
  );
  assert.equal(
    (await post(`/api/invitations/${invite.id}/accept`)).status,
    200,
    'Accepted invitation retry is idempotent',
  );
  assert.equal(
    (await post(base, details, 'PATCH')).status,
    200,
    'Editors can edit shared trip details',
  );
  assert.equal(
    (
      await post(base + '/invitations', {
        email: 'editor-invite@example.test',
        role: 'viewer',
      })
    ).status,
    201,
  );
  assert.equal(
    (await post(base, undefined, 'DELETE')).status,
    403,
    'Editors cannot delete the trip',
  );
  assert.equal(
    (await post(base, { ...details, link: 'javascript:alert(1)' }, 'PATCH'))
      .status,
    400,
  );
  assert.equal((await (await read(base)).json()).link, details.link);
  setCookie(ownerCookie);
  assert.equal(
    (
      await post(base + '/members', {
        action: 'role',
        userId: userIds[0],
        role: 'viewer',
      })
    ).status,
    200,
  );
  setCookie(cookies[0]);
  assert.equal(
    (
      await post(base + '/bookmarks', {
        title: 'Blocked',
        url: 'https://example.test/blocked',
      })
    ).status,
    403,
    'Viewers cannot save bookmarks',
  );
  assert.equal((await read(base)).status, 200, 'Viewer can read trip');
  assert.equal((await (await read(base)).json()).role, 'viewer');
  setCookie(ownerCookie);
  const third = await post(base + '/invitations', {
    email: emails[1],
    role: 'viewer',
  });
  assert.equal(third.status, 201);
  const invite2 = await third.json();
  assert.equal(
    (await post(base + `/invitations/${invite2.id}`, undefined, 'DELETE'))
      .status,
    200,
  );
  setCookie(cookies[1]);
  assert.equal(
    (await post(`/api/invitations/${invite2.id}/accept`)).status,
    409,
    'Revoked invitation rejected',
  );
  await db.query(
    'UPDATE "TripInvitation" SET "revokedAt"=NULL,"expiresAt"=NOW()-interval \'1 day\' WHERE id=$1',
    [invite2.id],
  );
  assert.equal(
    (await post(`/api/invitations/${invite2.id}/accept`)).status,
    409,
    'Expired invitation rejected',
  );
  await db.query(
    'UPDATE "TripInvitation" SET "expiresAt"=NOW()+interval \'1 day\' WHERE id=$1',
    [invite2.id],
  );
  assert.equal(
    (await post(`/api/invitations/${invite2.id}/accept`)).status,
    200,
  );
  assert.equal(
    (await post(base + '/members', { action: 'leave' })).status,
    200,
  );
  assert.equal(
    (await post(`/api/invitations/${invite2.id}/accept`)).status,
    409,
    'Leaving cannot be undone with a used invitation',
  );
  setCookie(ownerCookie);
  const transfer = await Promise.all([
    post(base + '/members', { action: 'transfer', userId: userIds[0] }),
    post(base + '/members', { action: 'transfer', userId: userIds[0] }),
  ]);
  assert.deepEqual(
    transfer.map((r) => r.status).sort(),
    [200, 403],
    'Only one racing transfer succeeds',
  );
  const owners = await db.query(
    'SELECT "userId" FROM "TripMember" WHERE "tripId"=$1 AND role=\'owner\'',
    [id],
  );
  assert.deepEqual(owners.rows, [{ userId: userIds[0] }]);
  assert.equal(
    (await post(base, undefined, 'DELETE')).status,
    403,
    'Former owner cannot delete',
  );
  setCookie(cookies[0]);
  assert.equal(
    (await post(base + '/members', { action: 'leave' })).status,
    409,
  );
  assert.equal(
    (await post(base + '/members', { action: 'remove', userId: owner.user.id }))
      .status,
    200,
  );
  setCookie(ownerCookie);
  assert.equal(
    (await post(base, details, 'PATCH')).status,
    404,
    'Removed member loses access',
  );
  assert.equal(
    (await read(base)).status,
    404,
    'Removed member loses read access',
  );
  setCookie(cookies[0]);
  assert.equal((await post(base, undefined, 'DELETE')).status, 200);
  assert.equal((await read(base)).status, 404, 'Deleted trip is unavailable');
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM "TripInvitation" WHERE "tripId"=$1',
        [id],
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM "TripMember" WHERE "tripId"=$1',
        [id],
      )
    ).rows[0].count,
    0,
  );
  await runBookmarks({
    db,
    origin,
    ownerCookie,
    ownerId: owner.user.id,
    userIds,
    cookies,
  });
  await runItinerary({ db, origin, ownerCookie, userIds, cookies });
  await runDiscussion({ db, origin, ownerCookie, userIds, cookies });
  await runEditConflicts({ db, origin, ownerCookie, userIds, cookies });
  await runReadLinks({ db, origin, ownerCookie, userIds, cookies });
  await runRealtime({ db, origin, ownerCookie, userIds, cookies });
  setCookie(ownerCookie);
  console.log(
    'PASS: trip editing, date validation, invitation SMTP, email-bound acceptance, resend cooldown, expired/revoked invitations, roles, leaving, racing ownership transfers, member removal, cascading deletion.',
  );
  return { email: emails[1], cookie: cookies[1] };
}
