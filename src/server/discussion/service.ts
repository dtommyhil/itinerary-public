import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/server/db/client';
import { authorize, lockTrip, validId } from '@/server/trips/service';
import { AppError } from '@/server/http/errors';
import { hasTripPermission } from '@/domain/trips/policies';
import { commentPermissions } from '@/domain/discussion/policies';
import {
  commentRevision,
  discussionInput,
  editCommentInput,
  newCommentInput,
  targetInput,
  voteInput,
  type DiscussionTarget,
} from '@/domain/discussion/inputs';
import type { DiscussionView, VoteView } from '@/domain/discussion/contracts';
import { recordActivity } from '@/server/activity/record';
import { parse, olderThan, nextCursor } from './pagination';
type Tx = Prisma.TransactionClient;
function scope(target: DiscussionTarget) {
  return target.resourceType === 'bookmark'
    ? { bookmarkId: target.resourceId, activityId: null }
    : { activityId: target.resourceId, bookmarkId: null };
}
async function requireTarget(tx: Tx, tripId: string, target: DiscussionTarget) {
  const where = { id: target.resourceId, tripId };
  const item =
    target.resourceType === 'bookmark'
      ? await tx.bookmark.findFirst({ where, select: { title: true } })
      : await tx.itineraryItem.findFirst({ where, select: { title: true } });
  if (!item)
    throw new AppError(
      'NOT_FOUND',
      'This bookmark or activity no longer exists',
    );
  return item;
}
async function votes(
  tx: Tx,
  tripId: string,
  userId: string,
  target: DiscussionTarget,
  canVote: boolean,
): Promise<VoteView> {
  const where = { tripId, ...scope(target) };
  const count = await tx.vote.count({ where });
  const mine = Boolean(
    await tx.vote.findFirst({
      where: { ...where, userId },
      select: { id: true },
    }),
  );
  return { count, mine, canVote };
}
export async function readDiscussion(
  tripId: string,
  userId: string,
  input: unknown,
): Promise<DiscussionView> {
  validId(tripId);
  const data = parse(discussionInput, input);
  const before = olderThan(data.cursor);
  return getDb().$transaction(
    async (tx) => {
      const member = await authorize(tx, tripId, userId, 'read');
      await requireTarget(tx, tripId, data);
      const rows = await tx.comment.findMany({
        where: { tripId, ...scope(data), ...before },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: data.limit + 1,
        include: { author: { select: { name: true } } },
      });
      return {
        total: await tx.comment.count({ where: { tripId, ...scope(data) } }),
        items: rows.slice(0, data.limit).map((c) => ({
          id: c.id,
          body: c.body,
          version: c.version,
          author: c.author.name,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          ...commentPermissions(member.role, userId, c.userId),
        })),
        nextCursor: nextCursor(rows, data.limit),
        canComment: hasTripPermission(member.role, 'comment'),
        votes: await votes(
          tx,
          tripId,
          userId,
          data,
          hasTripPermission(member.role, 'vote'),
        ),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function readVotes(
  tripId: string,
  userId: string,
  input: unknown,
) {
  validId(tripId);
  const data = parse(targetInput, input);
  return getDb().$transaction(
    async (tx) => {
      const member = await authorize(tx, tripId, userId, 'read');
      await requireTarget(tx, tripId, data);
      return votes(
        tx,
        tripId,
        userId,
        data,
        hasTripPermission(member.role, 'vote'),
      );
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function createComment(
  tripId: string,
  userId: string,
  input: unknown,
) {
  const data = parse(newCommentInput, input);
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'comment');
    const target = await requireTarget(tx, tripId, data);
    const comment = await tx.comment.create({
      data: { tripId, userId, ...scope(data), body: data.body },
      select: { id: true },
    });
    await recordActivity(
      tx,
      tripId,
      userId,
      'comment.created',
      comment.id,
      target.title,
    );
    return comment;
  });
}
export async function changeComment(
  tripId: string,
  userId: string,
  id: string,
  input: unknown,
  remove = false,
) {
  validId(id);
  const data = remove
    ? { ...parse(commentRevision, input), body: undefined }
    : parse(editCommentInput, input);
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    const member = await authorize(tx, tripId, userId, 'comment');
    const comment = await tx.comment.findFirst({ where: { id, tripId } });
    if (!comment) throw new AppError('NOT_FOUND', 'Comment not found');
    const policy = commentPermissions(member.role, userId, comment.userId);
    if (!(remove ? policy.canDelete : policy.canEdit))
      throw new AppError(
        'FORBIDDEN',
        'You do not have permission to change this comment',
      );
    if (comment.version !== data.version)
      throw new AppError(
        'CONFLICT',
        'This comment changed. Refresh the discussion, then reopen the comment editor.',
      );
    const target = await requireTarget(
      tx,
      tripId,
      comment.bookmarkId
        ? { resourceType: 'bookmark', resourceId: comment.bookmarkId }
        : { resourceType: 'activity', resourceId: comment.activityId! },
    );
    if (remove) await tx.comment.delete({ where: { id } });
    else
      await tx.comment.update({
        where: { id },
        data: {
          body: data.body,
          version: { increment: 1 },
        },
      });
    await recordActivity(
      tx,
      tripId,
      userId,
      remove ? 'comment.deleted' : 'comment.updated',
      id,
      target.title,
    );
    return { ok: true };
  });
}
export async function setVote(tripId: string, userId: string, input: unknown) {
  const data = parse(voteInput, input);
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'vote');
    const target = await requireTarget(tx, tripId, data);
    const where = { tripId, userId, ...scope(data) };
    const existing = await tx.vote.findFirst({ where });
    if (data.value === 1 && !existing) {
      await tx.vote.create({ data: where });
      await recordActivity(
        tx,
        tripId,
        userId,
        'vote.added',
        data.resourceId,
        target.title,
      );
    } else if (data.value === 0 && existing) {
      await tx.vote.delete({ where: { id: existing.id } });
      await recordActivity(
        tx,
        tripId,
        userId,
        'vote.removed',
        data.resourceId,
        target.title,
      );
    }
    return votes(tx, tripId, userId, data, true);
  });
}
