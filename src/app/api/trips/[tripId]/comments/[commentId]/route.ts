import { changeComment } from '@/server/discussion/service';
import { requireSession, requireOrigin, readJson } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string; commentId: string }> };
async function mutate(request: Request, context: Context, remove: boolean) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const { tripId, commentId } = await context.params;
    return Response.json(
      await changeComment(
        tripId,
        session.user.id,
        commentId,
        await readJson(request),
        remove,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export const PATCH = (request: Request, context: Context) =>
  mutate(request, context, false);
export const DELETE = (request: Request, context: Context) =>
  mutate(request, context, true);
