import { expect, it } from 'vitest';
import { authReturnPath } from '../src/domain/auth/return-path';
const id = '00000000-0000-4000-8000-000000000001';
it.each([
  '/trips/new',
  `/trips/${id}`,
  `/trips/${id}/bookmarks`,
  `/trips/${id}/itinerary`,
  `/trips/${id}/edit`,
  `/invitations/${id}`,
  `/join/${'a'.repeat(64)}`,
])('preserves shared destination %s', (path) => {
  expect(authReturnPath(path)).toBe(path);
});
it.each([
  undefined,
  ['bad'],
  'https://evil.example',
  '//evil.example',
  '/\\evil.example',
  `/trips/${id}?next=https://evil.example`,
  '/trips/../login',
  '/invitations/not-an-id',
  `/join/${'a'.repeat(63)}`,
  `/join/${'a'.repeat(64)}?next=https://evil.example`,
  `/join/${'a'.repeat(64)}/extra`,
])('rejects untrusted redirect %s', (path) => {
  expect(authReturnPath(path)).toBe('/trips');
});
