import { acceptReadLink } from '@/server/trips/read-links';
import { requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await acceptReadLink((await context.params).token, session.user),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
