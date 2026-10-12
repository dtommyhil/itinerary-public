import { revokeInvitation } from '@/server/trips/service';
import { requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
export async function DELETE(
  request: Request,
  context: { params: Promise<{ tripId: string; invitationId: string }> },
) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    const { tripId, invitationId } = await context.params;
    return Response.json(
      await revokeInvitation(tripId, session.user.id, invitationId),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
