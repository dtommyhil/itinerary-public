import {
  saveBookmark,
  removeBookmark,
  getBookmark,
} from '@/server/bookmarks/service';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string; bookmarkId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const params = await context.params;
    return Response.json(
      await saveBookmark(
        params.tripId,
        session.user.id,
        await readJson(request),
        params.bookmarkId,
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
      await removeBookmark(params.tripId, session.user.id, params.bookmarkId),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tripId: string; bookmarkId: string }> },
) {
  try {
    const session = await requireSession(request);
    const { tripId, bookmarkId } = await context.params;
    return Response.json(
      await getBookmark(tripId, session.user.id, bookmarkId),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
