'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function JoinButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const router = useRouter();
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const response = await fetch(`/api/join/${token}`, {
              method: 'POST',
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error?.message ?? 'Unable to join');
            router.replace(`/trips/${data.tripId}`);
          } catch (error) {
            setError(
              error instanceof Error ? error.message : 'Unable to connect',
            );
            setBusy(false);
          }
        }}
      >
        {busy ? 'Joining…' : 'Join as viewer'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
