import { readItinerary } from '@/server/itinerary/service';
import { requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
export async function GET(
  request: Request,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    const session = await requireSession(request);
    return Response.json(
      await readItinerary((await context.params).tripId, session.user.id),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
