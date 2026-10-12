import 'server-only';
import { recordActivity } from '@/server/activity/record';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import type { Prisma } from '@/generated/prisma/client';
import { AppError } from '@/server/http/errors';
import {
  memberAction,
  tripDates,
  tripDetails,
  tripUpdateInput,
  inviteInput,
} from '@/domain/trips/inputs';
import {
  hasTripPermission,
  type TripPermission,
} from '@/domain/trips/policies';
import { sendAuthEmail } from '@/server/email';
type Tx = Prisma.TransactionClient;
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new AppError('NOT_FOUND', 'Trip not found');
}
export async function lockTrip(tx: Tx, tripId: string) {
  validId(tripId);
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Trip" WHERE id=${tripId}::uuid FOR UPDATE`;
  if (!rows.length) throw new AppError('NOT_FOUND', 'Trip not found');
}
export async function authorize(
  tx: Tx,
  tripId: string,
  userId: string,
  permission: TripPermission,
) {
  const member = await tx.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
  if (!member) throw new AppError('NOT_FOUND', 'Trip not found');
  if (!hasTripPermission(member.role, permission))
    throw new AppError('FORBIDDEN', 'You do not have permission to do that');
  return member;
}
export async function createTrip(userId: string, input: unknown) {
  const parsed = tripDetails.safeParse(input);
  if (!parsed.success)
    throw new AppError('VALIDATION_ERROR', parsed.error.issues[0].message);
  const tripId = randomUUID();
  // Prisma's nested write commits the trip and its owner together or neither.
  return getDb().trip.create({
    data: {
      id: tripId,
      ...tripDates(parsed.data),
      createdBy: userId,
      members: { create: { userId, role: 'owner' } },
      activityLogs: {
        create: {
          actorId: userId,
          action: 'trip.created',
          entityId: tripId,
          title: parsed.data.name,
        },
      },
    },
    select: { id: true },
  });
}
export async function updateTrip(
  tripId: string,
  userId: string,
  input: unknown,
) {
  const parsed = tripUpdateInput.safeParse(input);
  if (!parsed.success)
    throw new AppError('VALIDATION_ERROR', parsed.error.issues[0].message);
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'manageTrip');
    const { version, ...fields } = parsed.data;
    const dates = tripDates(fields);
    const current = await tx.trip.findUniqueOrThrow({ where: { id: tripId } });
    if (current.detailsVersion !== version)
      throw new AppError(
        'STALE_VERSION',
        'This trip changed since you opened the editor. Review the latest details before saving.',
      );
    if (
      current.timezone !== dates.timezone &&
      (await tx.itineraryItem.count({
        where: { day: { tripId }, startTime: { not: null } },
      }))
    )
      throw new AppError(
        'CONFLICT',
        'Clear activity times before changing the trip timezone so scheduled instants are not silently shifted',
      );
    if (dates.startDate && dates.endDate) {
      const outside = await tx.itineraryDay.count({
        where: {
          tripId,
          OR: [
            { date: { lt: dates.startDate } },
            { date: { gt: dates.endDate } },
          ],
        },
      });
      if (outside)
        throw new AppError(
          'CONFLICT',
          'Existing itinerary days fall outside those dates',
        );
    }
    await tx.trip.update({
      where: { id: tripId },
      data: {
        ...dates,
        detailsVersion: { increment: 1 },
        itineraryVersion: { increment: 1 },
      },
    });
    await recordActivity(
      tx,
      tripId,
      userId,
      'trip.updated',
      tripId,
      dates.name,
    );
    return { ok: true };
  });
}
export async function deleteTrip(tripId: string, userId: string) {
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'deleteTrip');
    await tx.trip.delete({ where: { id: tripId } });
    return { ok: true };
  });
}
export async function changeMember(
  tripId: string,
  userId: string,
  input: unknown,
) {
  const parsed = memberAction.safeParse(input);
  if (!parsed.success)
    throw new AppError('VALIDATION_ERROR', 'Invalid member action');
  const action = parsed.data;
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    const actor = await authorize(
      tx,
      tripId,
      userId,
      action.action === 'leave' ? 'read' : 'manageMembers',
    );
    if (action.action === 'leave') {
      if (actor.role === 'owner')
        throw new AppError(
          'CONFLICT',
          'Transfer ownership before leaving the trip',
        );
      await tx.tripMember.delete({
        where: { tripId_userId: { tripId, userId } },
      });
      await recordActivity(tx, tripId, userId, 'member.left', userId);
      return { ok: true };
    }
    const target = await tx.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: action.userId } },
    });
    if (!target) throw new AppError('NOT_FOUND', 'Member not found');
    if (target.role === 'owner')
      throw new AppError(
        'CONFLICT',
        'Use ownership transfer to change the owner',
      );
    const where = { tripId_userId: { tripId, userId: target.userId } };
    if (action.action === 'transfer') {
      // Demote first to satisfy the partial unique owner index, within one locked transaction.
      await tx.tripMember.update({
        where: { tripId_userId: { tripId, userId } },
        data: { role: 'editor' },
      });
      await tx.tripMember.update({ where, data: { role: 'owner' } });
    } else if (action.action === 'role')
      await tx.tripMember.update({ where, data: { role: action.role } });
    else {
      await tx.tripMember.delete({ where });
      // A removed member must not be able to rejoin with an old group link.
      await tx.tripReadLink.deleteMany({ where: { tripId } });
    }
    await recordActivity(
      tx,
      tripId,
      userId,
      action.action === 'remove'
        ? 'member.removed'
        : action.action === 'role'
          ? 'member.role'
          : 'member.transfer',
      action.userId,
    );
    return { ok: true };
  });
}
export async function inviteMember(
  tripId: string,
  userId: string,
  input: unknown,
) {
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      'VALIDATION_ERROR',
      'Enter a valid email and choose editor or viewer',
    );
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new Error('Missing app URL');
  const invitation = await getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'inviteMembers');
    const existingMember = await tx.tripMember.findFirst({
      where: { tripId, user: { email: parsed.data.email } },
    });
    if (existingMember)
      throw new AppError('CONFLICT', 'That person is already a trip member');
    const previous = await tx.tripInvitation.findUnique({
      where: { tripId_email: { tripId, email: parsed.data.email } },
    });
    if (previous && previous.updatedAt.getTime() > Date.now() - 60000)
      throw new AppError(
        'CONFLICT',
        'Wait one minute before sending another invitation to this address',
      );
    const recent = await tx.tripInvitation.count({
      where: { tripId, updatedAt: { gt: new Date(Date.now() - 3600000) } },
    });
    if (recent >= 20)
      throw new AppError(
        'CONFLICT',
        'This trip has reached its invitation limit. Try again in an hour',
      );
    const data = {
      ...parsed.data,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      acceptedAt: null,
      revokedAt: null,
    };
    const result = await tx.tripInvitation.upsert({
      where: { tripId_email: { tripId, email: parsed.data.email } },
      create: { ...data, tripId },
      update: { ...data, id: randomUUID() },
    });
    await recordActivity(tx, tripId, userId, 'invitation.sent', result.id);
    return result;
  });
  let delivered = true;
  try {
    await sendAuthEmail(
      invitation.email,
      'You’re invited to plan a trip on itinerary',
      `${base}/invitations/${invitation.id}`,
    );
  } catch {
    delivered = false;
  }
  return { id: invitation.id, delivered };
}
export async function revokeInvitation(
  tripId: string,
  userId: string,
  id: string,
) {
  validId(id);
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'manageMembers');
    const result = await tx.tripInvitation.updateMany({
      where: { id, tripId, acceptedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new AppError('NOT_FOUND', 'Invitation not found');
    await recordActivity(tx, tripId, userId, 'invitation.revoked', id);
    return { ok: true };
  });
}
export async function acceptInvitation(
  id: string,
  user: { id: string; email: string; emailVerified: boolean },
) {
  validId(id);
  if (!user.emailVerified)
    throw new AppError('FORBIDDEN', 'Verify your email before joining a trip');
  return getDb().$transaction(async (tx) => {
    const invitation = await tx.tripInvitation.findUnique({ where: { id } });
    if (!invitation || invitation.email !== user.email.toLowerCase())
      throw new AppError('NOT_FOUND', 'Invitation not found for this account');
    await lockTrip(tx, invitation.tripId);
    const fresh = await tx.tripInvitation.findUnique({ where: { id } });
    if (!fresh || fresh.revokedAt || fresh.expiresAt <= new Date())
      throw new AppError(
        'CONFLICT',
        'This invitation has expired or was revoked',
      );
    const member = await tx.tripMember.findUnique({
      where: { tripId_userId: { tripId: fresh.tripId, userId: user.id } },
    });
    if (fresh.acceptedAt) {
      if (member) return { tripId: fresh.tripId };
      throw new AppError(
        'CONFLICT',
        'This invitation has already been used. Ask for a new invitation',
      );
    }
    if (!member)
      await tx.tripMember.create({
        data: { tripId: fresh.tripId, userId: user.id, role: fresh.role },
      });
    await tx.tripInvitation.update({
      where: { id },
      data: { acceptedAt: new Date() },
    });
    await recordActivity(tx, fresh.tripId, user.id, 'member.joined', user.id);
    return { tripId: fresh.tripId };
  });
}
