import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

export async function runReadLinks({
  db,
  origin,
  ownerCookie,
  userIds,
  cookies,
}) {
  const request = (
    path,
    method = 'GET',
    body,
    cookie = ownerCookie,
    requestOrigin = origin,
  ) =>
    fetch(origin + path, {
      method,
      headers: {
        cookie,
        origin: requestOrigin,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
  async function result(response, status = 200) {
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  }
  const trip = await result(
    await request('/api/trips', 'POST', {
      name: 'Read-only sharing fixture',
      timezone: 'UTC',
    }),
    201,
  );
  const base = `/api/trips/${trip.id}`;
  const links = base + '/read-link';
  const member = async (userId) =>
    (
      await db.query(
        'SELECT role FROM "TripMember" WHERE "tripId"=$1 AND "userId"=$2',
        [trip.id, userId],
      )
    ).rows[0];
  const events = async (action) =>
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "ActivityLog" WHERE "tripId"=$1 AND action=$2',
        [trip.id, action],
      )
    ).rows[0].n;
  const state = async () =>
    (
      await db.query('SELECT * FROM "TripReadLink" WHERE "tripId"=$1', [
        trip.id,
      ])
    ).rows[0];
  const create = async (cookie = ownerCookie) =>
    result(await request(links, 'POST', undefined, cookie), 201);
  const join = (link, cookie = cookies[1], body) =>
    request('/api' + link.path, 'POST', body, cookie);
  let deleted = false;
  try {
    await db.query(
      'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,\'editor\')',
      [trip.id, userIds[0]],
    );
    await result(await request(links, 'POST', undefined, ''), 401);
    await result(await request(links, 'POST', undefined, cookies[1]), 404);
    await result(
      await request(
        links,
        'POST',
        undefined,
        ownerCookie,
        'https://another-origin.example',
      ),
      403,
    );
    assert.equal(await state(), undefined);
    const link = await create(cookies[0]);
    assert.match(link.path, /^\/join\/[a-f0-9]{64}$/);
    const token = link.path.split('/').at(-1);
    const stored = await state();
    assert.equal(
      stored.tokenHash,
      createHash('sha256').update(token).digest('hex'),
    );
    assert(
      !JSON.stringify(stored).includes(token),
      'Raw bearer token is not stored',
    );
    assert(
      Math.abs(Date.parse(link.expiresAt) - Date.now() - 7 * 86400000) < 30000,
    );
    assert.equal(await events('invitation.linkCreated'), 1);
    await result(await request(links, 'POST'), 409);
    assert.deepEqual(
      await state(),
      stored,
      'Cooldown rejects rotation without changing link state',
    );
    await result(await join(link, ''), 401);
    await result(
      await request(
        '/api' + link.path,
        'POST',
        undefined,
        cookies[1],
        'https://another-origin.example',
      ),
      403,
    );
    await result(
      await request('/api/join/bad-token', 'POST', undefined, cookies[1]),
      404,
    );
    await result(
      await request(
        '/api/join/' + randomBytes(32).toString('hex'),
        'POST',
        undefined,
        cookies[1],
      ),
      404,
    );
    assert.equal(await member(userIds[1]), undefined);
    await db.query('UPDATE "User" SET "emailVerified"=false WHERE id=$1', [
      userIds[1],
    ]);
    try {
      await result(await join(link), 403);
    } finally {
      await db.query('UPDATE "User" SET "emailVerified"=true WHERE id=$1', [
        userIds[1],
      ]);
    }
    const accepted = await Promise.all([
      join(link),
      join(link, cookies[1], { role: 'owner', tripId: 'another-trip' }),
    ]);
    for (const response of accepted)
      assert.deepEqual(await result(response), { tripId: trip.id });
    assert.equal(
      (await member(userIds[1])).role,
      'viewer',
      'Body cannot grant elevated access',
    );
    assert.equal(
      await events('member.joined'),
      1,
      'Repeated/racing acceptance records only one membership event',
    );
    await result(await join(link));
    assert.equal(await events('member.joined'), 1);
    await result(await join(link, cookies[0]));
    assert.equal(
      (await member(userIds[0])).role,
      'editor',
      'Existing editor is not downgraded',
    );
    await result(await join(link, ownerCookie));
    assert.equal((await result(await request(base))).role, 'owner');
    assert.equal(await events('member.joined'), 1);
    await result(await request(links, 'POST', undefined, cookies[1]), 403);
    await result(await request(links, 'DELETE', undefined, cookies[0]), 403);
    await result(await request(links, 'DELETE', undefined, cookies[1]), 403);
    await result(
      await request(
        base + '/bookmarks',
        'POST',
        { title: 'Viewer write' },
        cookies[1],
      ),
      403,
    );
    await result(
      await request(
        base + '/members',
        'POST',
        { action: 'remove', userId: userIds[0] },
        cookies[1],
      ),
      403,
    );
    await db.query(
      'UPDATE "TripReadLink" SET "expiresAt"=now()-interval \'1 second\' WHERE "tripId"=$1',
      [trip.id],
    );
    await result(await join(link), 404);
    assert.equal(await events('member.joined'), 1);
    await db.query(
      'UPDATE "TripReadLink" SET "createdAt"=now()-interval \'2 minutes\' WHERE "tripId"=$1',
      [trip.id],
    );
    const rotated = await create();
    assert.notEqual(rotated.path, link.path);
    await result(await join(link), 404);
    await result(await join(rotated));
    const feed = await result(await request(base + '/activity'));
    assert(
      !JSON.stringify(feed).includes(token),
      'Activity feed never exposes invitation tokens',
    );
    await result(
      await request(
        links,
        'DELETE',
        undefined,
        ownerCookie,
        'https://another-origin.example',
      ),
      403,
    );
    await result(await request(links, 'DELETE'));
    await result(await request(links, 'DELETE'));
    assert.equal(
      await events('invitation.linkRevoked'),
      1,
      'Revocation is idempotent',
    );
    await result(await join(rotated), 404);
    await result(await request(base, 'GET', undefined, cookies[1]), 200);
    const removalLink = await create();
    await result(
      await request(base + '/members', 'POST', {
        action: 'remove',
        userId: userIds[1],
      }),
    );
    assert.equal(await state(), undefined);
    await result(await join(removalLink), 404);
    await result(await request(base, 'GET', undefined, cookies[1]), 404);
    await result(
      await request(
        base + '/bookmarks',
        'POST',
        { title: 'Removed write' },
        cookies[1],
      ),
      404,
    );
    const racedLink = await create();
    const [joining, revoking] = await Promise.all([
      join(racedLink),
      request(links, 'DELETE'),
    ]);
    assert([200, 404].includes(joining.status));
    await result(revoking);
    assert.equal(
      Boolean(await member(userIds[1])),
      joining.status === 200,
      'Revoke/accept race respects the committed ordering',
    );
    await result(await join(racedLink), 404);
    const deletedLink = await create();
    await result(await request(base, 'DELETE'));
    deleted = true;
    assert.equal(await state(), undefined);
    await result(await join(deletedLink), 404);
    console.log(
      'PASS: read-only link roles, verified-session/CSRF boundaries, hashed tokens, cooldown/expiry/rotation/revocation, idempotent concurrent acceptance, role preservation, removal/deletion, and revoke/accept ordering.',
    );
  } finally {
    await db.query('UPDATE "User" SET "emailVerified"=true WHERE id=$1', [
      userIds[1],
    ]);
    if (!deleted) await request(base, 'DELETE');
  }
}
