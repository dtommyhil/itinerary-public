import assert from 'node:assert/strict';
export async function runItinerary({
  db,
  origin,
  ownerCookie,
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
  async function result(response, status) {
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    return body;
  }
  const trip = await result(
    await request('/api/trips', 'POST', {
      name: 'Itinerary fixture',
      timezone: 'America/Denver',
    }),
    201,
  );
  const other = await result(
    await request('/api/trips', 'POST', {
      name: 'Other itinerary',
      timezone: 'UTC',
    }),
    201,
  );
  const base = `/api/trips/${trip.id}`;
  const path = base + '/itinerary';
  for (let i = 0; i < 2; i++)
    await db.query(
      'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,$3)',
      [trip.id, userIds[i], i === 0 ? 'editor' : 'viewer'],
    );
  const read = async () => result(await request(path), 200);
  async function write(
    suffix,
    method,
    body = {},
    status = 200,
    cookie = ownerCookie,
  ) {
    return result(
      await request(
        path + suffix,
        method,
        { version: (await read()).version, ...body },
        cookie,
      ),
      status,
    );
  }
  await result(await request(path, 'GET', undefined, ''), 401);
  await result(
    await request(
      `/api/trips/${other.id}/itinerary`,
      'GET',
      undefined,
      cookies[0],
    ),
    404,
  );
  await write('/days', 'POST', { date: '2028-03-02' }, 403, cookies[1]);
  await write('/days', 'POST', { date: '2027-02-29' }, 400);
  const first = await write(
    '/days',
    'POST',
    { date: '2028-03-12' },
    201,
    cookies[0],
  );
  const second = await write('/days', 'POST', { date: '2028-11-05' }, 201);
  await write('/days', 'POST', { date: '2028-03-12' }, 409);
  await write(
    '/activities',
    'POST',
    { dayId: first.id, title: 'Skipped time', startTime: '02:30' },
    400,
  );
  await write(
    '/activities',
    'POST',
    { dayId: second.id, title: 'Repeated time', startTime: '01:30' },
    400,
  );
  const source = await result(
    await request(base + '/bookmarks', 'POST', {
      title: 'Coffee',
      url: 'https://example.test/coffee',
      notes: 'Original notes',
    }),
    201,
  );
  const a = await write(
    '/activities',
    'POST',
    {
      dayId: first.id,
      bookmarkId: source.id,
      startTime: '09:00',
      endTime: '10:00',
    },
    201,
    cookies[0],
  );
  const b = await write(
    '/activities',
    'POST',
    { dayId: first.id, title: 'Walk' },
    201,
  );
  let plan = await read();
  assert.equal(plan.days[0].activities[0].startTime, '09:00');
  const stored = await db.query(
    'SELECT "startTime" FROM "ItineraryItem" WHERE id=$1',
    [a.id],
  );
  assert.equal(
    stored.rows[0].startTime.toISOString(),
    '2028-03-12T15:00:00.000Z',
  );
  assert.deepEqual(
    (await result(await request(base + '/bookmarks'), 200)).items[0]
      .scheduledDays,
    ['2028-03-12'],
  );
  await result(
    await request(base, 'PATCH', {
      name: 'Itinerary fixture',
      timezone: 'UTC',
    }),
    409,
  );
  await result(
    await request(base, 'PATCH', {
      name: 'Itinerary fixture',
      timezone: 'America/Denver',
      startDate: '2028-03-13',
      endDate: '2028-03-14',
    }),
    409,
  );
  await write(`/days/${first.id}/order`, 'PUT', { ids: [a.id] }, 409);
  await write(`/days/${first.id}/order`, 'PUT', { ids: [a.id, a.id] }, 400);
  await write(
    `/days/${first.id}/order`,
    'PUT',
    { ids: [b.id, a.id] },
    403,
    cookies[1],
  );
  await write(
    `/activities/${a.id}`,
    'PATCH',
    { dayId: first.id, title: 'Denied' },
    403,
    cookies[1],
  );
  await write(`/activities/${a.id}`, 'DELETE', {}, 403, cookies[1]);
  await write(`/days/${first.id}`, 'DELETE', {}, 403, cookies[1]);
  await write(
    `/days/${first.id}`,
    'PATCH',
    { date: '2028-03-13' },
    403,
    cookies[1],
  );
  // Concurrent writers start from one snapshot; only one can publish a new order.
  plan = await read();
  const races = await Promise.all(
    [0, 1].map(() =>
      request(path + `/days/${first.id}/order`, 'PUT', {
        version: plan.version,
        ids: [b.id, a.id],
      }),
    ),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual(
    (await read()).days[0].activities.map((x) => x.id),
    [b.id, a.id],
  );
  await write(`/activities/${a.id}`, 'PATCH', {
    dayId: second.id,
    title: 'Coffee',
    startTime: '09:00',
    endTime: '10:00',
    notes: 'Original notes',
    url: 'https://example.test/coffee',
  });
  assert.deepEqual(
    (await read()).days[0].activities.map((x) => x.id),
    [b.id],
  );
  await write(`/days/${second.id}`, 'PATCH', { date: '2028-11-06' });
  assert.equal((await read()).days[1].activities[0].startTime, '09:00');
  const foreignDay = await result(
    await request(`/api/trips/${other.id}/itinerary/days`, 'POST', {
      version: 0,
      date: '2028-04-01',
    }),
    201,
  );
  await write(
    '/activities',
    'POST',
    { dayId: foreignDay.id, title: 'Cross-trip' },
    404,
  );
  await result(
    await request(
      `/api/trips/${other.id}/itinerary/activities/${a.id}`,
      'DELETE',
      { version: 1 },
    ),
    404,
  );
  await result(
    await request(`/api/trips/${other.id}/itinerary/activities`, 'POST', {
      version: 1,
      dayId: foreignDay.id,
      bookmarkId: source.id,
    }),
    404,
  );
  await result(
    await request(base + `/bookmarks/${source.id}`, 'PATCH', {
      title: 'Changed source',
    }),
    200,
  );
  assert.equal((await read()).days[1].activities[0].title, 'Coffee');
  await result(await request(base + `/bookmarks/${source.id}`, 'DELETE'), 200);
  const snapshot = (await read()).days[1].activities[0];
  assert.equal(snapshot.bookmarkId, null);
  assert.equal(snapshot.url, 'https://example.test/coffee');
  assert.equal(snapshot.notes, 'Original notes');
  await write(`/activities/${b.id}`, 'DELETE');
  await write(`/activities/${b.id}`, 'DELETE', {}, 404);
  await write(`/days/${second.id}`, 'DELETE');
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "ItineraryItem" WHERE id=$1',
        [a.id],
      )
    ).rows[0].n,
    0,
  );
  assert.deepEqual((await read()).days[0].activities, []);
  await result(await request(base, 'DELETE'), 200);
  await result(await request(`/api/trips/${other.id}`, 'DELETE'), 200);
  await result(await request(path), 404);
  const calendar = await result(
    await request('/api/trips', 'POST', {
      name: 'Empty calendar activity fixture',
      timezone: 'America/Denver',
      startDate: '2028-03-11',
      endDate: '2028-03-13',
    }),
    201,
  );
  const calendarBase = `/api/trips/${calendar.id}`;
  const calendarPath = calendarBase + '/itinerary';
  const calendarRead = async () => result(await request(calendarPath), 200);
  await db.query(
    'INSERT INTO "TripMember" ("tripId","userId",role) VALUES ($1,$2,$3)',
    [calendar.id, userIds[1], 'viewer'],
  );
  try {
    const empty = await calendarRead();
    assert.deepEqual(empty.days, []);
    for (const [fields, status, cookie] of [
      [{ dayDate: '2028-03-12', title: 'Viewer plan' }, 403, cookies[1]],
      [{ dayDate: '2028-03-12', title: 'Nonmember plan' }, 404, cookies[0]],
      [{ dayDate: '2028-03-10', title: 'Outside range' }, 400, ownerCookie],
      [
        {
          dayDate: '2028-03-12',
          title: 'Skipped DST time',
          startTime: '02:30',
        },
        400,
        ownerCookie,
      ],
    ]) {
      await result(
        await request(
          calendarPath + '/activities',
          'POST',
          { version: empty.version, ...fields },
          cookie,
        ),
        status,
      );
      assert.deepEqual(
        await calendarRead(),
        empty,
        'Rejected saves must not leave a day behind',
      );
    }
    const calendarRaces = await Promise.all(
      [0, 1].map((index) =>
        request(calendarPath + '/activities', 'POST', {
          version: empty.version,
          dayDate: '2028-03-11',
          title: `Calendar plan ${index}`,
        }),
      ),
    );
    assert.deepEqual(
      calendarRaces.map((response) => response.status).sort(),
      [201, 409],
    );
    let saved = await calendarRead();
    assert.equal(saved.days.length, 1);
    assert.equal(saved.days[0].date, '2028-03-11');
    assert.equal(saved.days[0].activities.length, 1);
    assert.equal(saved.version, empty.version + 1);
    await result(
      await request(calendarPath + '/activities', 'POST', {
        version: saved.version,
        dayDate: '2028-03-11',
        title: 'Another plan on the same date',
      }),
      201,
    );
    saved = await calendarRead();
    assert.equal(saved.days.length, 1);
    assert.equal(saved.days[0].activities.length, 2);
    await result(
      await request(calendarPath + '/activities', 'POST', {
        version: saved.version,
        dayDate: '2028-03-12',
        bookmarkId: '00000000-0000-4000-8000-000000000099',
      }),
      404,
    );
    assert.deepEqual(await calendarRead(), saved);
    const dayLogs = await db.query(
      'SELECT count(*)::int AS n FROM "ActivityLog" WHERE "tripId"=$1 AND action=$2',
      [calendar.id, 'day.created'],
    );
    assert.equal(
      dayLogs.rows[0].n,
      1,
      'Only the committed calendar day is logged',
    );
  } finally {
    await result(await request(calendarBase, 'DELETE'), 200);
  }
  console.log(
    'PASS: itinerary CRUD, roles/isolation, bookmark snapshots, trip-local DST validation, moving/dating, atomic calendar-day creation and rollback, reorder races, stale versions, and cascades.',
  );
}
