import 'server-only';
import { readTripLinks, type TripLink } from '@/domain/trips/links';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { AppError } from '@/server/http/errors';
import type { TripRole } from '@/domain/trips/policies';
import { validId } from './service';

const listInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

/** Public contract: dates are calendar strings, timestamps and DB internals stay private. */
export type TripSummary = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  link: string | null;
  links: TripLink[];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  role: TripRole;
};
const tripSelect = {
  detailsVersion: true,
  id: true,
  name: true,
  description: true,
  link: true,
  links: true,
  timezone: true,
  startDate: true,
  endDate: true,
} as const;
function summary(member: {
  role: TripRole;
  trip: Omit<
    TripSummary,
    'role' | 'startDate' | 'endDate' | 'links' | 'version'
  > & {
    links: unknown;
    detailsVersion: number;
    startDate: Date | null;
    endDate: Date | null;
  };
}): TripSummary {
  const { detailsVersion, ...trip } = member.trip;
  return {
    ...trip,
    version: detailsVersion,
    links: readTripLinks(member.trip.links, member.trip.link),
    startDate: member.trip.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: member.trip.endDate?.toISOString().slice(0, 10) ?? null,
    role: member.role,
  };
}
export async function listTrips(userId: string, input: unknown) {
  const parsed = listInput.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      'VALIDATION_ERROR',
      'Use a limit from 1 to 100 and a valid trip cursor',
    );
  const { limit, cursor } = parsed.data;
  // Stable UUID ordering; keyset filtering also works if the cursor trip was deleted.
  const rows = await getDb().tripMember.findMany({
    where: { userId, ...(cursor ? { tripId: { gt: cursor } } : {}) },
    select: { role: true, trip: { select: tripSelect } },
    orderBy: { tripId: 'asc' },
    take: limit + 1,
  });
  const items = rows.slice(0, limit).map(summary);
  return {
    items,
    nextCursor: rows.length > limit ? items[items.length - 1].id : null,
  };
}
export async function getTrip(
  userId: string,
  tripId: string,
): Promise<TripSummary> {
  validId(tripId);
  const member = await getDb().tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { role: true, trip: { select: tripSelect } },
  });
  if (!member) throw new AppError('NOT_FOUND', 'Trip not found');
  return summary(member);
}
