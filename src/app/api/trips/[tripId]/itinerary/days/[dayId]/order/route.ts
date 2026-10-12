import { reorderActivities } from '@/server/itinerary/service';
import { requireOrigin, requireSession, readJson } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string; dayId: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await reorderActivities(
        params.tripId,
        session.user.id,
        params.dayId,
        await readJson(request),
      ),
      { status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
