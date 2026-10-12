import { readVotes, setVote } from '@/server/discussion/service';
import { requireSession, requireOrigin, readJson } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession(request);
    const input = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(
      await readVotes((await context.params).tripId, session.user.id, input),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const input = await readJson(request);
    return Response.json(
      await setVote((await context.params).tripId, session.user.id, input),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
