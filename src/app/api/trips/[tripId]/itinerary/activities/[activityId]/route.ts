import { saveActivity, deleteActivity } from '@/server/itinerary/service';
import { requireOrigin, requireSession, readJson } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string; activityId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await saveActivity(
        params.tripId,
        session.user.id,
        await readJson(request),
        params.activityId,
      ),
      { status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await deleteActivity(
        params.tripId,
        session.user.id,
        params.activityId,
        await readJson(request),
      ),
      { status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
