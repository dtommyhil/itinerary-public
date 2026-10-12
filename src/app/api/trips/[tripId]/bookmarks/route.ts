import { saveBookmark, listBookmarks } from '@/server/bookmarks/service';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await saveBookmark(
        (await context.params).tripId,
        session.user.id,
        await readJson(request),
      ),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession(request);
    const params = new URL(request.url).searchParams;
    return Response.json(
      await listBookmarks(
        (await context.params).tripId,
        session.user.id,
        Object.fromEntries(params),
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
