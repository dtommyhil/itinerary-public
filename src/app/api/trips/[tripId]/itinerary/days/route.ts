import { saveDay } from '@/server/itinerary/service';
import { requireOrigin, requireSession, readJson } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await saveDay(params.tripId, session.user.id, await readJson(request)),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
