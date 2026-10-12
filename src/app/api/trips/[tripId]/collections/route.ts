import { saveCollection } from '@/server/bookmarks/service';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await saveCollection(
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
