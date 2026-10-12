import 'server-only';
import { getDb } from '@/server/db/client';
import { authorize, validId } from '@/server/trips/service';
import { pageInput } from '@/domain/discussion/inputs';
import {
  activityLabels,
  type ActivityAction,
  type FeedView,
} from '@/domain/discussion/contracts';
import { parse, olderThan, nextCursor } from '@/server/discussion/pagination';
export async function readActivity(
  tripId: string,
  userId: string,
  input: unknown,
): Promise<FeedView> {
  validId(tripId);
  const data = parse(pageInput, input);
  const before = olderThan(data.cursor);
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, tripId, userId, 'read');
      const rows = await tx.activityLog.findMany({
        where: { tripId, ...before },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: data.limit + 1,
        include: { actor: { select: { name: true } } },
      });
      return {
        items: rows.slice(0, data.limit).map((row) => ({
          id: row.id,
          actor: row.actor?.name ?? 'Deleted account',
          description:
            activityLabels[row.action as ActivityAction] ?? 'updated the trip',
          title: row.title,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor: nextCursor(rows, data.limit),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
