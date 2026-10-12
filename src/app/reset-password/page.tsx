'use client';
import { createAuthClient } from 'better-auth/react';
import {
  confirmedPasswordError,
  PASSWORD_REQUIREMENTS,
} from '@/domain/auth/password';
import { PasswordInput } from '@/app/components/password-input';
import { useState } from 'react';
const auth = createAuthClient();
export default function ResetPassword() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main>
      <h1>Choose a new password</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const newPassword = String(data.get('password'));
          const validation = confirmedPasswordError(
            newPassword,
            String(data.get('confirmPassword')),
          );
          if (validation) {
            setMessage(validation);
            return;
          }
          setBusy(true);
          try {
            const token = new URLSearchParams(window.location.search).get(
              'token',
            );
            if (!token) {
              setMessage('This reset link is invalid. Request a new one.');
              return;
            }
            const result = await auth.resetPassword({
              token,
              newPassword,
            });
            setMessage(
              result.error
                ? result.error.status === 429
                  ? 'Too many attempts. Please wait a minute and try again.'
                  : 'This reset link is invalid or expired. Request a new one.'
                : 'Password changed. You can now sign in.',
            );
          } catch {
            setMessage('Unable to connect. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordInput
          label="New password"
          name="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          disabled={busy}
          aria-describedby="password-help"
        />
        <p id="password-help">{PASSWORD_REQUIREMENTS}</p>
        <PasswordInput
          label="Confirm new password"
          name="confirmPassword"
          required
          maxLength={128}
          autoComplete="new-password"
          disabled={busy}
        />
        <button disabled={busy}>Change password</button>
      </form>
      <p role="status">{message}</p>
      <a href="/login">Sign in</a>
      <p>
        <a href="/forgot-password">Request a new link</a>
      </p>
    </main>
  );
}
