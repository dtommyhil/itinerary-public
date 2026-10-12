import 'server-only';
import { hasTripPermission } from '@/domain/trips/policies';
import { recordActivity } from '@/server/activity/record';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { AppError } from '@/server/http/errors';
import { authorize, lockTrip, validId } from '@/server/trips/service';
import {
  bookmarkDetails,
  bookmarkUpdateInput,
  bookmarkFilters,
  collectionDetails,
} from '@/domain/bookmarks/inputs';
import type { Prisma } from '@/generated/prisma/client';
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError('VALIDATION_ERROR', result.error.issues[0].message);
  return result.data;
};
async function writable<T>(
  tripId: string,
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'editContent');
    return fn(tx);
  });
}
export async function listBookmarks(
  tripId: string,
  userId: string,
  input: unknown,
) {
  validId(tripId);
  const filters = parse(bookmarkFilters, input);
  return getDb().$transaction(
    async (tx) => {
      const member = await authorize(tx, tripId, userId, 'read');
      const collections = await tx.collection.findMany({
        where: { tripId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      });
      if (
        filters.collection &&
        filters.collection !== 'unfiled' &&
        !collections.some((c) => c.id === filters.collection)
      )
        throw new AppError('NOT_FOUND', 'Collection not found');
      const rows = await tx.bookmark.findMany({
        where: {
          tripId,
          ...(filters.category ? { category: filters.category } : {}),
          ...(filters.cursor ? { id: { gt: filters.cursor } } : {}),
          ...(filters.collection
            ? {
                collections:
                  filters.collection === 'unfiled'
                    ? { none: {} }
                    : { some: { collectionId: filters.collection } },
              }
            : {}),
        },
        select: {
          _count: { select: { comments: true, votes: true } },
          votes: { where: { userId }, select: { id: true }, take: 1 },
          id: true,
          version: true,
          title: true,
          url: true,
          category: true,
          notes: true,
        },
        orderBy: { id: 'asc' },
        take: filters.limit + 1,
      });
      const page = rows.slice(0, filters.limit);
      const ids = page.map((row) => row.id);
      // Prisma dispatches sibling relation reads concurrently on a transaction's
      // single pg connection. Await these bounded bulk reads instead of relying
      // on the driver's deprecated implicit query queue. No per-bookmark queries.
      const links = ids.length
        ? await tx.bookmarkCollection.findMany({
            where: { tripId, bookmarkId: { in: ids } },
            select: { bookmarkId: true, collectionId: true },
          })
        : [];
      const activities = ids.length
        ? await tx.itineraryItem.findMany({
            where: { tripId, bookmarkId: { in: ids } },
            select: { bookmarkId: true, day: { select: { date: true } } },
          })
        : [];
      const collectionIds = new Map<string, string[]>();
      for (const link of links) {
        const group = collectionIds.get(link.bookmarkId) ?? [];
        group.push(link.collectionId);
        collectionIds.set(link.bookmarkId, group);
      }
      const scheduledDays = new Map<string, Set<string>>();
      for (const activity of activities) {
        if (!activity.bookmarkId) continue;
        const group =
          scheduledDays.get(activity.bookmarkId) ?? new Set<string>();
        group.add(activity.day.date.toISOString().slice(0, 10));
        scheduledDays.set(activity.bookmarkId, group);
      }
      const items = page.map(({ _count, votes, ...row }) => ({
        discussion: {
          comments: _count.comments,
          votes: {
            count: _count.votes,
            mine: votes.length > 0,
            canVote: hasTripPermission(member.role, 'vote'),
          },
        },
        scheduledDays: [...(scheduledDays.get(row.id) ?? [])].sort(),
        ...row,
        collectionIds: collectionIds.get(row.id) ?? [],
      }));
      return {
        items,
        collections,
        nextCursor:
          rows.length > filters.limit ? items[items.length - 1].id : null,
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function saveBookmark(
  tripId: string,
  userId: string,
  input: unknown,
  id?: string,
) {
  const parsed = id
    ? parse(bookmarkUpdateInput, input)
    : { ...parse(bookmarkDetails, input), version: undefined };
  const { version, ...data } = parsed;
  if (id) validId(id);
  return writable(tripId, userId, async (tx) => {
    if (id) {
      const current = await tx.bookmark.findFirst({ where: { id, tripId } });
      if (!current) throw new AppError('NOT_FOUND', 'Bookmark not found');
      if (current.version !== version)
        throw new AppError(
          'STALE_VERSION',
          'This bookmark changed since you opened the editor. Review the latest details before saving.',
        );
    }
    if (
      data.collectionIds.length !==
      (await tx.collection.count({
        where: { tripId, id: { in: data.collectionIds } },
      }))
    )
      throw new AppError('NOT_FOUND', 'Collection not found');
    if (
      data.url &&
      (await tx.bookmark.findFirst({
        where: { tripId, url: data.url, ...(id ? { id: { not: id } } : {}) },
      }))
    )
      throw new AppError(
        'CONFLICT',
        'This link is already bookmarked in this trip',
      );
    const { collectionIds, ...fields } = data;
    const bookmark = id
      ? await tx.bookmark.update({
          where: { id },
          data: { ...fields, version: { increment: 1 } },
          select: { id: true, version: true },
        })
      : await tx.bookmark.create({
          data: { ...fields, tripId, savedBy: userId },
          select: { id: true, version: true },
        });
    await tx.bookmarkCollection.deleteMany({
      where: { bookmarkId: bookmark.id, tripId },
    });
    if (collectionIds.length)
      await tx.bookmarkCollection.createMany({
        data: collectionIds.map((collectionId) => ({
          tripId,
          bookmarkId: bookmark.id,
          collectionId,
        })),
      });
    await recordActivity(
      tx,
      tripId,
      userId,
      id ? 'bookmark.updated' : 'bookmark.created',
      bookmark.id,
      data.title,
    );
    return bookmark;
  });
}
export async function removeBookmark(
  tripId: string,
  userId: string,
  id: string,
) {
  validId(id);
  return writable(tripId, userId, async (tx) => {
    const previous = await tx.bookmark.findFirst({ where: { id, tripId } });
    const result = await tx.bookmark.deleteMany({ where: { id, tripId } });
    if (!result.count) throw new AppError('NOT_FOUND', 'Bookmark not found');
    await recordActivity(
      tx,
      tripId,
      userId,
      'bookmark.deleted',
      id,
      previous?.title,
    );
    return { ok: true };
  });
}
export async function saveCollection(
  tripId: string,
  userId: string,
  input: unknown,
  id?: string,
) {
  const { name } = parse(collectionDetails, input);
  if (id) validId(id);
  return writable(tripId, userId, async (tx) => {
    if (id && !(await tx.collection.findFirst({ where: { id, tripId } })))
      throw new AppError('NOT_FOUND', 'Collection not found');
    if (
      await tx.collection.findFirst({
        where: {
          tripId,
          name: { equals: name, mode: 'insensitive' },
          ...(id ? { id: { not: id } } : {}),
        },
      })
    )
      throw new AppError(
        'CONFLICT',
        'A collection with that name already exists',
      );
    if (!id && (await tx.collection.count({ where: { tripId } })) >= 100)
      throw new AppError('CONFLICT', 'A trip can have up to 100 collections');
    const result = id
      ? await tx.collection.update({
          where: { id },
          data: { name },
          select: { id: true, name: true },
        })
      : await tx.collection.create({
          data: { tripId, name },
          select: { id: true, name: true },
        });
    await recordActivity(
      tx,
      tripId,
      userId,
      id ? 'collection.updated' : 'collection.created',
      result.id,
      name,
    );
    return result;
  });
}
export async function removeCollection(
  tripId: string,
  userId: string,
  id: string,
) {
  validId(id);
  return writable(tripId, userId, async (tx) => {
    const previous = await tx.collection.findFirst({ where: { id, tripId } });
    const result = await tx.collection.deleteMany({ where: { id, tripId } });
    if (!result.count) throw new AppError('NOT_FOUND', 'Collection not found');
    await recordActivity(
      tx,
      tripId,
      userId,
      'collection.deleted',
      id,
      previous?.name,
    );
    return { ok: true };
  });
}

export async function getBookmark(tripId: string, userId: string, id: string) {
  validId(tripId);
  validId(id);
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, tripId, userId, 'read');
      const row = await tx.bookmark.findFirst({
        where: { id, tripId },
        select: {
          id: true,
          version: true,
          title: true,
          notes: true,
          url: true,
          category: true,
          collections: { select: { collectionId: true } },
        },
      });
      if (!row) throw new AppError('NOT_FOUND', 'Bookmark not found');
      const { collections, ...fields } = row;
      return {
        ...fields,
        collectionIds: collections.map((c) => c.collectionId),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
