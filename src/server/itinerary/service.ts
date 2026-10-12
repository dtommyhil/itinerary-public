import 'server-only';
import { hasTripPermission } from '@/domain/trips/policies';
import { recordActivity } from '@/server/activity/record';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import type { Prisma } from '@/generated/prisma/client';
import { AppError } from '@/server/http/errors';
import { authorize, lockTrip, validId } from '@/server/trips/service';
import {
  activityInput,
  dayInput,
  orderInput,
  revision,
} from '@/domain/itinerary/inputs';
import { localTime, scheduledInstant } from '@/domain/itinerary/schedule';
type Tx = Prisma.TransactionClient;
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError('VALIDATION_ERROR', result.error.issues[0].message);
  return result.data;
}
async function mutate<T>(
  tripId: string,
  userId: string,
  version: number,
  action: (
    tx: Tx,
    trip: { timezone: string; startDate: Date | null; endDate: Date | null },
  ) => Promise<T>,
) {
  return getDb().$transaction(
    async (tx) => {
      await lockTrip(tx, tripId);
      await authorize(tx, tripId, userId, 'editContent');
      const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId } });
      if (trip.itineraryVersion !== version)
        throw new AppError(
          'CONFLICT',
          'The itinerary changed. Reload the latest plan before trying again.',
        );
      const result = await action(tx, trip);
      await tx.trip.update({
        where: { id: tripId },
        data: { itineraryVersion: { increment: 1 } },
      });
      return result;
    },
    { timeout: 15000 },
  );
}
function checkDate(
  date: string,
  trip: { startDate: Date | null; endDate: Date | null },
) {
  if (
    (trip.startDate && date < trip.startDate.toISOString().slice(0, 10)) ||
    (trip.endDate && date > trip.endDate.toISOString().slice(0, 10))
  )
    throw new AppError(
      'VALIDATION_ERROR',
      'Choose a day within the trip dates',
    );
  return new Date(`${date}T00:00:00Z`);
}
async function findDay(tx: Tx, tripId: string, id: string) {
  validId(id);
  const day = await tx.itineraryDay.findFirst({ where: { id, tripId } });
  if (!day) throw new AppError('NOT_FOUND', 'Day not found');
  return day;
}
async function findActivity(tx: Tx, tripId: string, id: string) {
  validId(id);
  const item = await tx.itineraryItem.findFirst({
    where: { id, day: { tripId } },
  });
  if (!item) throw new AppError('NOT_FOUND', 'Activity not found');
  return item;
}
async function positions(tx: Tx, dayId: string, ids?: string[]) {
  const rows = await tx.itineraryItem.findMany({
    where: { itineraryDayId: dayId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  const order = ids ?? rows.map((r) => r.id);
  if (
    order.length !== rows.length ||
    order.some((id) => !rows.some((r) => r.id === id))
  )
    throw new AppError(
      'CONFLICT',
      'Reload the latest activities before reordering',
    );
  // All positions are nonnegative and unique even during the transaction.
  await tx.itineraryItem.updateMany({
    where: { itineraryDayId: dayId },
    data: { position: { increment: 2000 } },
  });
  for (const [position, id] of order.entries())
    await tx.itineraryItem.update({ where: { id }, data: { position } });
}
export async function readItinerary(tripId: string, userId: string) {
  validId(tripId);
  return getDb().$transaction(
    async (tx) => {
      const member = await authorize(tx, tripId, userId, 'read');
      const trip = await tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: {
          name: true,
          timezone: true,
          startDate: true,
          endDate: true,
          itineraryVersion: true,
        },
      });
      const days = await tx.itineraryDay.findMany({
        where: { tripId },
        orderBy: { date: 'asc' },
        include: {
          items: {
            orderBy: { position: 'asc' },
            select: {
              _count: { select: { comments: true, votes: true } },
              votes: { where: { userId }, select: { id: true }, take: 1 },
              id: true,
              title: true,
              notes: true,
              url: true,
              bookmarkId: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      });
      return {
        name: trip.name,
        timezone: trip.timezone,
        startDate: trip.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: trip.endDate?.toISOString().slice(0, 10) ?? null,
        version: trip.itineraryVersion,
        days: days.map((day) => ({
          id: day.id,
          date: day.date.toISOString().slice(0, 10),
          activities: day.items.map(({ _count, votes, ...item }) => ({
            discussion: {
              comments: _count.comments,
              votes: {
                count: _count.votes,
                mine: votes.length > 0,
                canVote: hasTripPermission(member.role, 'vote'),
              },
            },
            ...item,
            startTime: localTime(item.startTime, trip.timezone),
            endTime: localTime(item.endTime, trip.timezone),
          })),
        })),
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
export async function saveDay(
  tripId: string,
  userId: string,
  input: unknown,
  id?: string,
) {
  const data = parse(dayInput, input);
  return mutate(tripId, userId, data.version, async (tx, trip) => {
    if (id) await findDay(tx, tripId, id);
    const date = checkDate(data.date, trip);
    if (
      await tx.itineraryDay.findFirst({
        where: { tripId, date, ...(id ? { id: { not: id } } : {}) },
      })
    )
      throw new AppError('CONFLICT', 'This day already exists');
    if (
      !id &&
      (await tx.itineraryDay.count({
        where: { tripId },
      })) >= 90
    )
      throw new AppError('CONFLICT', 'A trip can have up to 90 itinerary days');
    if (id) {
      const items = await tx.itineraryItem.findMany({
        where: { itineraryDayId: id },
      });
      let rescheduled;
      try {
        rescheduled = items.map((item) => ({
          id: item.id,
          startTime: scheduledInstant(
            data.date,
            localTime(item.startTime, trip.timezone),
            trip.timezone,
          ),
          endTime: scheduledInstant(
            data.date,
            localTime(item.endTime, trip.timezone),
            trip.timezone,
          ),
        }));
      } catch (error) {
        throw new AppError(
          'VALIDATION_ERROR',
          error instanceof Error ? error.message : 'Invalid schedule',
        );
      }
      for (const { id: itemId, ...times } of rescheduled)
        await tx.itineraryItem.update({ where: { id: itemId }, data: times });
      const result = await tx.itineraryDay.update({
        where: { id },
        data: { date },
        select: { id: true },
      });
      await recordActivity(tx, tripId, userId, 'day.updated', id, data.date);
      return result;
    }
    const result = await tx.itineraryDay.create({
      data: { tripId, date },
      select: { id: true },
    });
    await recordActivity(
      tx,
      tripId,
      userId,
      'day.created',
      result.id,
      data.date,
    );
    return result;
  });
}
export async function deleteDay(
  tripId: string,
  userId: string,
  id: string,
  input: unknown,
) {
  const { version } = parse(revision, input);
  return mutate(tripId, userId, version, async (tx) => {
    const day = await findDay(tx, tripId, id);
    await tx.itineraryDay.delete({ where: { id } });
    await recordActivity(
      tx,
      tripId,
      userId,
      'day.deleted',
      id,
      day.date.toISOString().slice(0, 10),
    );
    return { ok: true };
  });
}
export async function saveActivity(
  tripId: string,
  userId: string,
  input: unknown,
  id?: string,
) {
  const data = parse(activityInput, input);
  return mutate(tripId, userId, data.version, async (tx, trip) => {
    const old = id ? await findActivity(tx, tripId, id) : null;
    if (old && data.bookmarkId)
      throw new AppError(
        'VALIDATION_ERROR',
        'A source bookmark can only be selected when creating an activity',
      );
    let day;
    if (data.dayId) day = await findDay(tx, tripId, data.dayId);
    else {
      // Save a previously empty calendar date and its activity together.
      const date = checkDate(data.dayDate!, trip);
      day = await tx.itineraryDay.findFirst({ where: { tripId, date } });
      if (!day) {
        if ((await tx.itineraryDay.count({ where: { tripId } })) >= 90)
          throw new AppError(
            'CONFLICT',
            'A trip can have up to 90 itinerary days',
          );
        day = await tx.itineraryDay.create({ data: { tripId, date } });
        await recordActivity(
          tx,
          tripId,
          userId,
          'day.created',
          day.id,
          data.dayDate!,
        );
      }
    }
    const bookmark = data.bookmarkId
      ? await tx.bookmark.findFirst({ where: { id: data.bookmarkId, tripId } })
      : null;
    if (data.bookmarkId && !bookmark)
      throw new AppError('NOT_FOUND', 'Bookmark not found');
    const title = data.title ?? bookmark?.title;
    if (!title)
      throw new AppError('VALIDATION_ERROR', 'Enter an activity title');
    if (
      (!old || old.itineraryDayId !== day.id) &&
      (await tx.itineraryItem.count({ where: { itineraryDayId: day.id } })) >=
        100
    )
      throw new AppError('CONFLICT', 'A day can have up to 100 activities');
    let startTime, endTime;
    try {
      startTime = scheduledInstant(
        day.date.toISOString().slice(0, 10),
        data.startTime,
        trip.timezone,
      );
      endTime = scheduledInstant(
        day.date.toISOString().slice(0, 10),
        data.endTime,
        trip.timezone,
      );
    } catch (error) {
      throw new AppError(
        'VALIDATION_ERROR',
        error instanceof Error ? error.message : 'Invalid schedule',
      );
    }
    const fields = {
      tripId,
      title,
      notes: data.notes ?? bookmark?.notes ?? '',
      url: data.url === undefined ? (bookmark?.url ?? null) : data.url,
      startTime,
      endTime,
      itineraryDayId: day.id,
    };
    const result = old
      ? await tx.itineraryItem.update({
          where: { id: old.id },
          data: {
            ...fields,
            ...(old.itineraryDayId !== day.id ? { position: 1000 } : {}),
          },
          select: { id: true },
        })
      : await tx.itineraryItem.create({
          data: {
            ...fields,
            position: 1000,
            createdBy: userId,
            bookmarkId: bookmark?.id,
          },
          select: { id: true },
        });
    if (old && old.itineraryDayId !== day.id)
      await positions(tx, old.itineraryDayId);
    await positions(tx, day.id);
    await recordActivity(
      tx,
      tripId,
      userId,
      id ? 'activity.updated' : 'activity.created',
      result.id,
      title,
    );
    return result;
  });
}
export async function deleteActivity(
  tripId: string,
  userId: string,
  id: string,
  input: unknown,
) {
  const { version } = parse(revision, input);
  return mutate(tripId, userId, version, async (tx) => {
    const item = await findActivity(tx, tripId, id);
    await tx.itineraryItem.delete({ where: { id } });
    await positions(tx, item.itineraryDayId);
    await recordActivity(
      tx,
      tripId,
      userId,
      'activity.deleted',
      id,
      item.title,
    );
    return { ok: true };
  });
}
export async function reorderActivities(
  tripId: string,
  userId: string,
  dayId: string,
  input: unknown,
) {
  const data = parse(orderInput, input);
  return mutate(tripId, userId, data.version, async (tx) => {
    const day = await findDay(tx, tripId, dayId);
    await positions(tx, dayId, data.ids);
    await recordActivity(
      tx,
      tripId,
      userId,
      'activity.reordered',
      dayId,
      day.date.toISOString().slice(0, 10),
    );
    return { ok: true };
  });
}
