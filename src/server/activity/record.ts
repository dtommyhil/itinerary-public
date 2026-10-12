import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import type { ActivityAction } from '@/domain/discussion/contracts';
/** Called within the mutation transaction. No comment bodies, URLs, emails, or secrets. */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  tripId: string,
  actorId: string,
  action: ActivityAction,
  entityId: string,
  title?: string,
) {
  await tx.activityLog.create({
    data: { tripId, actorId, action, entityId, title },
  });
}
