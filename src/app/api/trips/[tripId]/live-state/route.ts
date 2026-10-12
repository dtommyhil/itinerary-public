import { requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
import { readLiveState } from '@/server/realtime/state';

export async function GET(
  request: Request,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    const session = await requireSession(request);
    return Response.json(
      await readLiveState((await context.params).tripId, session.user.id),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
