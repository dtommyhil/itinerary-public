'use client';
import { createAuthClient } from 'better-auth/react';
import { useState } from 'react';
const auth = createAuthClient();
export default function ForgotPassword() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main>
      <h1>Reset your password</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true);
          try {
            const result = await auth.requestPasswordReset({
              email: String(data.get('email')).trim().toLowerCase(),
              redirectTo: '/reset-password',
            });
            setMessage(
              result.error
                ? result.error.status === 429
                  ? 'Too many requests. Please wait a minute and try again.'
                  : 'Unable to send the reset email. Please try again.'
                : 'If an account exists, you will receive a password reset link.',
            );
          } catch {
            setMessage('Unable to connect. Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button disabled={busy}>Send reset link</button>
      </form>
      <p role="status">{message}</p>
      <a href="/login">Back to sign in</a>
    </main>
  );
}
