import { describe, expect, it } from 'vitest';
import {
  hasTripPermission,
  type TripPermission,
  type TripRole,
} from '../src/domain/trips/policies';
import { readDatabaseEnv } from '../src/server/config/env';
import { AppError, errorResponse } from '../src/server/http/errors';
import { GET } from '../src/app/api/health/route';
describe('trip authorization boundary', () => {
  const actions: TripPermission[] = [
    'read',
    'manageTrip',
    'manageMembers',
    'inviteMembers',
    'editContent',
    'comment',
    'vote',
    'deleteTrip',
  ];
  it.each<TripRole | null>(['owner', 'editor', 'viewer', null])(
    'enforces all permissions for %s',
    (role) => {
      const allowed = actions.filter((action) =>
        hasTripPermission(role, action),
      );
      expect(allowed).toEqual(
        role === 'owner'
          ? actions
          : role === 'editor'
            ? [
                'read',
                'manageTrip',
                'inviteMembers',
                'editContent',
                'comment',
                'vote',
              ]
            : role === 'viewer'
              ? ['read']
              : [],
      );
    },
  );
});
it('rejects missing and non-PostgreSQL configuration without exposing secrets', () => {
  expect(() => readDatabaseEnv({})).toThrow('DATABASE_URL');
  expect(() =>
    readDatabaseEnv({ DATABASE_URL: 'https://secret:password@example.com' }),
  ).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL');
  expect(
    readDatabaseEnv({ DATABASE_URL: 'postgresql://localhost/itinerary' })
      .DATABASE_URL,
  ).toBe('postgresql://localhost/itinerary');
});
it('returns safe internal errors and consistent authorization failures', async () => {
  const internal = errorResponse(new Error('password=secret'));
  expect(internal.status).toBe(500);
  expect(JSON.stringify(await internal.json())).not.toContain('secret');
  const denied = errorResponse(
    new AppError('FORBIDDEN', 'Insufficient trip permissions'),
  );
  expect(denied.status).toBe(403);
  expect(await denied.json()).toEqual({
    error: { code: 'FORBIDDEN', message: 'Insufficient trip permissions' },
  });
});
it('provides uncached liveness independently of database access', async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok' });
});
