import { createTrip } from '@/server/trips/service';
import { listTrips } from '@/server/trips/queries';
import { errorResponse } from '@/server/http/errors';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const params = new URL(request.url).searchParams;
    return Response.json(
      await listTrips(session.user.id, {
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      }),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const trip = await createTrip(session.user.id, await readJson(request));
    return Response.json(trip, {
      status: 201,
      headers: { Location: `/api/trips/${trip.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
