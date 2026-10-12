import 'server-only';
import { getDb } from '@/server/db/client';
import { AppError } from '@/server/http/errors';
import { validId } from '@/server/trips/service';

/** A small authorized snapshot; the gateway never interprets session cookies. */
export async function readLiveState(tripId: string, userId: string) {
  validId(tripId);
  const member = await getDb().tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { role: true, trip: { select: { itineraryVersion: true } } },
  });
  if (!member) throw new AppError('NOT_FOUND', 'Trip not found');
  return { version: member.trip.itineraryVersion, role: member.role };
}
