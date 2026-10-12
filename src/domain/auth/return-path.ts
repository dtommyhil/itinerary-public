/** Accept only app-owned destinations, never arbitrary URLs from a query string. */
export function authReturnPath(value: unknown): string {
  if (value === '/trips/new') return value;
  if (typeof value !== 'string') return '/trips';
  if (/^\/join\/[a-f0-9]{64}$/.test(value)) return value;
  return /^\/(?:trips|invitations)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/(?:bookmarks|itinerary|edit))?$/i.test(
    value,
  )
    ? value
    : '/trips';
}
