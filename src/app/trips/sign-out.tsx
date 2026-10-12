'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { Icon } from './[tripId]/icons';
import { UiDialog } from './ui-dialog';
const auth = createAuthClient();
export function SignOut({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <div className="trips-account">
      <button
        className="icon"
        aria-label="Your account"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <UiDialog title="Your account" onDismiss={() => setOpen(false)}>
          <p className="detail-text">
            {name}
            <br />
            <span className="hint">{email}</span>
          </p>
          <div className="menu-options">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage('');
                try {
                  const result = await auth.signOut();
                  if (result.error) setMessage('Unable to sign out');
                  else router.push('/login');
                } catch {
                  setMessage('Unable to connect');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="logout" />
              Sign out
            </button>
          </div>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
        </UiDialog>
      )}
    </div>
  );
}
