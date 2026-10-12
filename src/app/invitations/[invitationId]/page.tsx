export const dynamic = 'force-dynamic';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { AcceptButton } from './accept-button';
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;
  if (!z.uuid().safeParse(invitationId).success) notFound();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session)
    return (
      <main>
        <h1>You’re invited</h1>
        <p>
          Sign in or create an account using the email address that received
          this invitation. After signing in, you’ll return here to accept it.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invitations/${invitationId}`)}`}
        >
          Sign in or create account
        </Link>
      </main>
    );
  const invite = await getDb().tripInvitation.findUnique({
    where: { id: invitationId },
    include: { trip: { select: { name: true } } },
  });
  if (!invite || invite.email !== session.user.email.toLowerCase())
    return (
      <main>
        <h1>Invitation unavailable</h1>
        <p>
          This invitation isn’t available for the account you’re signed in with.
          Use the email address that received it.
        </p>
        <Link href="/trips">Your trips</Link>
      </main>
    );
  if (invite.revokedAt || invite.expiresAt <= new Date())
    return (
      <main>
        <h1>Invitation expired or revoked</h1>
        <p>Ask the trip owner for a new invitation.</p>
        <Link href="/trips">Your trips</Link>
      </main>
    );
  return (
    <main>
      <h1>Join {invite.trip.name}</h1>
      <p>
        You’re invited as an {invite.role}. Accept to share this trip with its
        members.
      </p>
      <AcceptButton id={invite.id} />
      <Link href="/trips">Your trips</Link>
    </main>
  );
}
