import { saveDay, deleteDay } from '@/server/itinerary/service';
import { requireOrigin, requireSession, readJson } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string; dayId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await saveDay(
        params.tripId,
        session.user.id,
        await readJson(request),
        params.dayId,
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
      await deleteDay(
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
