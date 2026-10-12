import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
export async function runBookmarks({
  db,
  origin,
  ownerCookie,
  ownerId,
  userIds,
  cookies,
}) {
  const request = async (path, method = 'GET', body, cookie = ownerCookie) => {
    if (
      method === 'PATCH' &&
      /^\/api\/trips\/[^/]+(?:\/bookmarks\/[^/]+)?$/.test(path) &&
      body?.version === undefined
    ) {
      const snapshot = await fetch(origin + path, { headers: { cookie } });
      body = {
        ...body,
        version: snapshot.ok ? (await snapshot.json()).version : 0,
      };
    }
    return fetch(origin + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const created = await request('/api/trips', 'POST', {
    name: 'Bookmark test trip',
    timezone: 'UTC',
  });
  assert.equal(created.status, 201);
  const trip = (await created.json()).id;
  const other = (
    await (
      await request('/api/trips', 'POST', {
        name: 'Other bookmark test trip',
        timezone: 'UTC',
      })
    ).json()
  ).id;
  const base = `/api/trips/${trip}`;
  for (let i = 0; i < 2; i++)
    await db.query(
      'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,$3)',
      [trip, userIds[i], i === 0 ? 'editor' : 'viewer'],
    );
  const collection = await request(base + '/collections', 'POST', {
    name: 'Coffee',
  });
  assert.equal(collection.status, 201);
  const col = (await collection.json()).id;
  assert.equal(
    (await request(base + '/collections', 'POST', { name: 'coffee' })).status,
    409,
  );
  const col2 = (
    await (
      await request(base + '/collections', 'POST', { name: 'Near hotel' })
    ).json()
  ).id;
  const foreignCol = (
    await (
      await request(`/api/trips/${other}/collections`, 'POST', {
        name: 'Private',
      })
    ).json()
  ).id;
  assert.equal(
    (
      await request(base + '/bookmarks', 'POST', {
        title: 'Foreign',
        collectionIds: [foreignCol],
      })
    ).status,
    404,
  );
  const fields = {
    title: 'Coffee option',
    url: 'https://example.test/cafe',
    category: 'cafe',
    notes: 'Maybe Tuesday',
    collectionIds: [col, col2],
  };
  const saved = await request(base + '/bookmarks', 'POST', fields, cookies[0]);
  assert.equal(saved.status, 201);
  const id = (await saved.json()).id;
  // Even a raw SQL writer cannot associate bookmarks across trips.
  await assert.rejects(
    db.query(
      'INSERT INTO "BookmarkCollection" ("tripId","bookmarkId","collectionId") VALUES ($1,$2,$3)',
      [trip, id, foreignCol],
    ),
    (e) => e.code === '23503',
  );
  assert.equal(
    (await request(base + '/bookmarks', 'POST', fields)).status,
    409,
  );
  const races = await Promise.all(
    [1, 2].map(() =>
      request(base + '/bookmarks', 'POST', {
        title: 'Concurrent',
        url: 'https://example.test/concurrent',
      }),
    ),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await request(base + '/bookmarks', 'POST', { title: 'No link idea' }))
      .status,
    201,
  );
  assert.equal(
    (await request(base + '/bookmarks', 'POST', { title: 'No link idea' }))
      .status,
    201,
    'Repeated titles without links are allowed',
  );
  for (const [path, method, body] of [
    [base + '/bookmarks', 'POST', { title: 'Denied' }],
    [base + `/bookmarks/${id}`, 'PATCH', fields],
    [base + `/bookmarks/${id}`, 'DELETE'],
    [base + '/collections', 'POST', { name: 'Denied' }],
    [base + `/collections/${col}`, 'DELETE'],
  ])
    assert.equal((await request(path, method, body, cookies[1])).status, 403);
  assert.equal(
    (await request(base + '/bookmarks', 'GET', undefined, '')).status,
    401,
  );
  assert.equal(
    (
      await request(
        `/api/trips/${other}/bookmarks`,
        'GET',
        undefined,
        cookies[0],
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(`/api/trips/${other}/bookmarks/${id}`, 'PATCH', fields))
      .status,
    404,
  );
  const filtered = await (
    await request(
      base + `/bookmarks?category=cafe&collection=${col}`,
      'GET',
      undefined,
      cookies[1],
    )
  ).json();
  assert.deepEqual(
    filtered.items.map((b) => b.id),
    [id],
  );
  assert.equal(filtered.items[0].collectionIds.length, 2);
  let cursor;
  const ids = [];
  do {
    const page = await (
      await request(
        base + '/bookmarks?limit=1' + (cursor ? `&cursor=${cursor}` : ''),
      )
    ).json();
    for (const b of page.items) {
      assert(!ids.includes(b.id));
      ids.push(b.id);
    }
    cursor = page.nextCursor;
    assert(ids.length < 10);
  } while (cursor);
  assert.equal(ids.length, 4);
  assert.equal((await request(base + '/bookmarks?limit=1000')).status, 400);
  assert.equal(
    (await request(base + `/bookmarks?collection=${foreignCol}`)).status,
    404,
  );
  assert.equal(
    (
      await request(base + `/bookmarks/${id}`, 'PATCH', {
        ...fields,
        title: 'Updated',
        collectionIds: [col],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        base + `/collections/${col}`,
        'PATCH',
        { name: 'Breakfast' },
        cookies[0],
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(base + `/collections/${col}`, 'DELETE')).status,
    200,
  );
  const unfiled = await (
    await request(base + '/bookmarks?collection=unfiled')
  ).json();
  assert(
    unfiled.items.some((b) => b.id === id),
    'Deleting collection preserves bookmark',
  );
  assert.equal(
    (await request(base + `/bookmarks/${id}`, 'DELETE')).status,
    200,
  );
  assert.equal(
    (await request(base + `/bookmarks/${id}`, 'DELETE')).status,
    404,
  );
  // Historical migrated bookmarks may still link to a Place; preserve those records.
  const placeId = randomUUID();
  await db.query(
    'INSERT INTO "Place" (id,name,category,"updatedAt") VALUES ($1,$2,$3,now())',
    [placeId, 'Original place', 'cafe'],
  );
  await db.query(
    'INSERT INTO "SavedPlace" (id,"tripId","placeId","savedBy",title) VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(), trip, placeId, ownerId, 'Original place'],
  );
  const linked = (
    await db.query(
      'SELECT id,"placeId" FROM "SavedPlace" WHERE "tripId"=$1 AND "placeId" IS NOT NULL',
      [trip],
    )
  ).rows[0];
  await request(base + `/bookmarks/${linked.id}`, 'PATCH', {
    title: 'Trip-specific title',
  });
  assert.equal(
    (await db.query('SELECT name FROM "Place" WHERE id=$1', [linked.placeId]))
      .rows[0].name,
    'Original place',
  );
  await request(base + `/bookmarks/${linked.id}`, 'DELETE');
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM "Place" WHERE id=$1', [
        linked.placeId,
      ])
    ).rows[0].n,
    1,
  );
  await db.query('DELETE FROM "Place" WHERE id=$1', [linked.placeId]);
  await request(base, 'DELETE');
  await request(`/api/trips/${other}`, 'DELETE');
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Collection" WHERE "tripId"=$1',
        [trip],
      )
    ).rows[0].n,
    0,
  );
  assert.equal((await request(base + '/bookmarks')).status, 404);
  assert(ownerId);
  console.log(
    'PASS: general/no-link bookmarks, normalization, duplicate races, filters/pagination, editor/viewer/nonmember boundaries, cross-trip FK, collections, preserved places, and deletion.',
  );
}
