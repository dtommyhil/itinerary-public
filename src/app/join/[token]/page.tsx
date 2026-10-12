import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { JoinButton } from './join-button';
export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default async function Join({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
  return (
    <main>
      <h1>You’re invited to view a trip</h1>
      <p>
        Join with read-only access to see the itinerary, bookmarks, and
        discussion. Existing members keep their current access.
      </p>
      <JoinButton token={token} />
    </main>
  );
}
