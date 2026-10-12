import { createReadLink, revokeReadLink } from '@/server/trips/read-links';
import { requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
type Context = { params: Promise<{ tripId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await createReadLink((await context.params).tripId, session.user.id),
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
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
      await revokeReadLink((await context.params).tripId, session.user.id),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
