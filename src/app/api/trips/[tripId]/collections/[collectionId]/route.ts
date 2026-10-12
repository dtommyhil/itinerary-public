import { saveCollection, removeCollection } from '@/server/bookmarks/service';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string; collectionId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await saveCollection(
        params.tripId,
        session.user.id,
        await readJson(request),
        params.collectionId,
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
    const params = await context.params;
    return Response.json(
      await removeCollection(
        params.tripId,
        session.user.id,
        params.collectionId,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
