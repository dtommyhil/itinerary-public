import { readActivity } from '@/server/activity/queries';
import { requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession(request);
    const input = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(
      await readActivity((await context.params).tripId, session.user.id, input),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
