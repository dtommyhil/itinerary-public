import assert from 'node:assert/strict';
export async function runEditConflicts({
  db,
  origin,
  ownerCookie,
  userIds,
  cookies,
}) {
  const request = (path, method = 'GET', body, cookie = ownerCookie) =>
    fetch(origin + path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  async function result(response, status = 200) {
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  }
  const details = {
    name: 'Revision fixture',
    timezone: 'UTC',
    startDate: '2028-01-01',
    endDate: '2028-03-30',
  };
  await result(
    await request('/api/trips', 'POST', { ...details, endDate: '2028-03-31' }),
    400,
  );
  const trip = await result(await request('/api/trips', 'POST', details), 201);
  const base = `/api/trips/${trip.id}`;
  const logs = async (action) =>
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "ActivityLog" WHERE "tripId"=$1 AND action=$2',
        [trip.id, action],
      )
    ).rows[0].n;
  try {
    for (let i = 0; i < 2; i++)
      await db.query(
        'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,$3)',
        [trip.id, userIds[i], i ? 'viewer' : 'editor'],
      );
    await result(await request(base, 'PATCH', details), 400);
    await result(
      await request(base, 'PATCH', { ...details, version: -1 }),
      400,
    );
    await result(
      await request(base, 'PATCH', { ...details, version: 0 }, cookies[1]),
      403,
    );
    const original = await result(await request(base));
    const races = await Promise.all(
      [ownerCookie, cookies[0]].map((cookie, i) =>
        request(
          base,
          'PATCH',
          { ...details, version: original.version, name: `Writer ${i}` },
          cookie,
        ),
      ),
    );
    assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
    const current = await result(await request(base));
    assert.equal(current.version, 1);
    assert.equal(await logs('trip.updated'), 1);
    await result(await request(base, 'PATCH', { ...details, version: 0 }), 409);
    await result(
      await request(base, 'PATCH', {
        ...details,
        version: 1,
        endDate: '2028-03-31',
      }),
      400,
    );
    assert.deepEqual(await result(await request(base)), current);
    const itinerary = await result(await request(base + '/itinerary'));
    await result(
      await request(base + '/itinerary/activities', 'POST', {
        dayDate: '2028-01-02',
        title: 'A separate plan edit',
        version: itinerary.version,
      }),
      201,
    );
    assert.equal(
      (await result(await request(base))).version,
      1,
      'Itinerary edits do not stale trip details',
    );
    await result(
      await request(base, 'PATCH', {
        ...details,
        version: 1,
        name: 'Reviewed draft',
      }),
    );
    const collectionIds = [];
    for (const name of ['First', 'Second'])
      collectionIds.push(
        (
          await result(
            await request(base + '/collections', 'POST', { name }),
            201,
          )
        ).id,
      );
    const fields = {
      title: 'Original idea',
      notes: 'Original notes',
      collectionIds: [collectionIds[0]],
    };
    const bookmark = await result(
      await request(base + '/bookmarks', 'POST', fields),
      201,
    );
    const path = `${base}/bookmarks/${bookmark.id}`;
    const get = async () => result(await request(path));
    assert.equal((await get()).version, 0);
    await result(await request(path, 'GET', undefined, ''), 401);
    await result(
      await request(
        `/api/trips/00000000-0000-4000-8000-000000000001/bookmarks/${bookmark.id}`,
      ),
      404,
    );
    await result(await request(path, 'PATCH', fields), 400);
    await result(
      await request(path, 'PATCH', { ...fields, version: 0 }, cookies[1]),
      403,
    );
    const writes = [0, 1].map((i) => ({
      ...fields,
      version: 0,
      title: `Idea writer ${i}`,
      collectionIds: [collectionIds[i]],
    }));
    const bookmarkRaces = await Promise.all(
      writes.map((data, i) =>
        request(path, 'PATCH', data, i ? cookies[0] : ownerCookie),
      ),
    );
    assert.deepEqual(bookmarkRaces.map((r) => r.status).sort(), [200, 409]);
    const winner = bookmarkRaces.findIndex((r) => r.status === 200);
    const saved = await get();
    assert.equal(saved.version, 1);
    assert.equal(saved.title, writes[winner].title);
    assert.deepEqual(saved.collectionIds, writes[winner].collectionIds);
    assert.equal(await logs('bookmark.updated'), 1);
    await result(await request(path, 'PATCH', { ...fields, version: 0 }), 409);
    assert.deepEqual(await get(), saved);
    assert.equal(await logs('bookmark.updated'), 1);
    await result(
      await request(base + '/votes', 'POST', {
        resourceType: 'bookmark',
        resourceId: bookmark.id,
        value: 1,
      }),
    );
    assert.equal(
      (await get()).version,
      1,
      'Likes do not stale bookmark fields',
    );
    await result(
      await request(path, 'PATCH', {
        ...saved,
        notes: 'Reviewed bookmark',
        version: 1,
      }),
    );
    assert.equal((await get()).version, 2);
    await result(await request(path, 'DELETE'));
    await result(await request(path, 'PATCH', { ...fields, version: 2 }), 404);
    console.log(
      'PASS: inclusive 90-day limit, simultaneous trip/bookmark saves, stale/missing revisions, role isolation, atomic collections/history, independent content versions, reviewed retries, and deleted resources.',
    );
  } finally {
    await request(base, 'DELETE');
  }
}
