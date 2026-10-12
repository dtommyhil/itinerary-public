import { getTrip } from '@/server/trips/queries';
import { updateTrip, deleteTrip } from '@/server/trips/service';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession(request);
    return Response.json(
      await getTrip(session.user.id, (await context.params).tripId),
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await updateTrip(
        (await context.params).tripId,
        session.user.id,
        await readJson(request),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await deleteTrip((await context.params).tripId, session.user.id),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
