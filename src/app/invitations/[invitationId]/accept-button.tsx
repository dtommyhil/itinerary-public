'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function AcceptButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setMessage('');
          try {
            const response = await fetch(`/api/invitations/${id}/accept`, {
              method: 'POST',
            });
            const result = await response.json();
            if (!response.ok) setMessage(result.error.message);
            else {
              router.push(`/trips/${result.tripId}`);
              router.refresh();
            }
          } catch {
            setMessage('Unable to connect. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Joining…' : 'Accept invitation'}
      </button>
      <p role="status">{message}</p>
    </>
  );
}
