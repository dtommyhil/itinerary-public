import { acceptInvitation } from '@/server/trips/service';
import { requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
export async function POST(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await acceptInvitation((await context.params).invitationId, session.user),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
