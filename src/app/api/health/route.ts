export const dynamic = 'force-dynamic';
/** Liveness only: a database outage must not trigger application restart loops. */
export function GET() {
  return Response.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
