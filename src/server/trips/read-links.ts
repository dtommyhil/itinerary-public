import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '@/server/db/client';
import { authorize, lockTrip } from './service';
import { AppError } from '@/server/http/errors';
import { recordActivity } from '@/server/activity/record';
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export async function createReadLink(tripId: string, userId: string) {
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'inviteMembers');
    const previous = await tx.tripReadLink.findUnique({ where: { tripId } });
    if (previous && previous.createdAt.getTime() > Date.now() - 60000)
      throw new AppError(
        'CONFLICT',
        'Wait one minute before replacing the read-only link',
      );
    const token = randomBytes(32).toString('hex');
    const fields = {
      tokenHash: hash(token),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    };
    const link = await tx.tripReadLink.upsert({
      where: { tripId },
      create: { tripId, ...fields },
      update: fields,
    });
    await recordActivity(tx, tripId, userId, 'invitation.linkCreated', link.id);
    return { path: `/join/${token}`, expiresAt: link.expiresAt.toISOString() };
  });
}
export async function revokeReadLink(tripId: string, userId: string) {
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, tripId);
    await authorize(tx, tripId, userId, 'manageMembers');
    const deleted = await tx.tripReadLink.deleteMany({ where: { tripId } });
    if (deleted.count)
      await recordActivity(
        tx,
        tripId,
        userId,
        'invitation.linkRevoked',
        tripId,
      );
    return { ok: true };
  });
}
export async function acceptReadLink(
  token: string,
  user: { id: string; emailVerified: boolean },
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError('NOT_FOUND', 'Invitation unavailable');
  if (!user.emailVerified)
    throw new AppError('FORBIDDEN', 'Verify your email before joining');
  const tokenHash = hash(token);
  const candidate = await getDb().tripReadLink.findUnique({
    where: { tokenHash },
  });
  if (!candidate)
    throw new AppError('NOT_FOUND', 'Invitation expired or revoked');
  return getDb().$transaction(async (tx) => {
    await lockTrip(tx, candidate.tripId);
    const link = await tx.tripReadLink.findUnique({ where: { tokenHash } });
    if (!link || link.expiresAt <= new Date())
      throw new AppError('NOT_FOUND', 'Invitation expired or revoked');
    const where = { tripId_userId: { tripId: link.tripId, userId: user.id } };
    const member = await tx.tripMember.findUnique({ where });
    if (!member) {
      await tx.tripMember.create({
        data: { tripId: link.tripId, userId: user.id, role: 'viewer' },
      });
      await recordActivity(tx, link.tripId, user.id, 'member.joined', user.id);
    }
    return { tripId: link.tripId };
  });
}
