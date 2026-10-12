import { inviteMember } from '@/server/trips/service';
import { readJson, requireOrigin, requireSession } from '@/server/http/session';
import { errorResponse } from '@/server/http/errors';
export async function POST(
  request: Request,
  context: { params: Promise<{ tripId: string }> },
) {
  try {
    requireOrigin(request);
    const session = await requireSession(request);
    return Response.json(
      await inviteMember(
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
