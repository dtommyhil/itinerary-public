import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { TripDraft } from '../trip-draft';
export default async function NewTrip() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login?next=%2Ftrips%2Fnew');
  return (
    <main className="reference-ui draft-page">
      <TripDraft timezones={Intl.supportedValuesOf('timeZone')} />
    </main>
  );
}
