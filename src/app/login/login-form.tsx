'use client';
import { createAuthClient } from 'better-auth/react';
import { useEffect, useRef, useState } from 'react';
import {
  confirmedPasswordError,
  PASSWORD_REQUIREMENTS,
} from '@/domain/auth/password';
import { displayNameSchema } from '@/domain/auth/display-name';
import { PasswordInput } from '@/app/components/password-input';
import { useRouter } from 'next/navigation';
const auth = createAuthClient();
export function LoginForm({
  googleEnabled,
  returnTo = '/trips',
  callbackError = false,
}: {
  googleEnabled: boolean;
  returnTo?: string;
  callbackError?: boolean;
}) {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState(
    callbackError
      ? 'That sign-in or verification link could not be completed. Try signing in or request a new verification email.'
      : '',
  );
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function resend() {
    if (busy || cooldown) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await auth.sendVerificationEmail({
        email: pendingEmail,
        callbackURL: returnTo,
      });
      if (result.error)
        setError(
          result.error.status === 429
            ? 'Too many requests. Please wait a minute before trying again.'
            : 'Unable to send the email right now. Please try again.',
        );
      else {
        setNotice(
          'If this address needs verification, a new link is on its way. Check your spam folder too.',
        );
        setCooldown(60);
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-form-section" aria-busy={busy}>
      <h1>
        {pendingEmail
          ? 'Check your inbox'
          : signup
            ? 'Make room for your next trip.'
            : 'Welcome back.'}
      </h1>
      {!pendingEmail && (
        <p className="subtitle">
          {signup
            ? 'Create an account to plan together.'
            : 'Your people. Your plans. All in one place.'}
        </p>
      )}
      {error && (
        <p className="form-error" ref={errorRef} tabIndex={-1} role="alert">
          {error}
        </p>
      )}
      {pendingEmail ? (
        <>
          <p>
            Check <strong>{pendingEmail}</strong> for a verification link. If
            you already have an account, sign in or reset your password.
          </p>
          <p>The verification link expires after one hour.</p>
          <button disabled={busy || cooldown > 0} onClick={resend}>
            {cooldown
              ? `Resend email in ${cooldown}s`
              : 'Resend verification email'}
          </button>
          <p role="status">{notice}</p>
          <button
            disabled={busy}
            onClick={() => {
              setPendingEmail('');
              setError('');
              setNotice('');
            }}
          >
            Use another email
          </button>{' '}
          <button
            disabled={busy}
            onClick={() => {
              setPendingEmail('');
              setSignup(false);
              setError('');
            }}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <form
            key={signup ? 'signup' : 'signin'}
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const form = event.currentTarget;
              const data = new FormData(form);
              const credentials = {
                email: String(data.get('email')).trim().toLowerCase(),
                password: String(data.get('password')),
              };
              setError('');
              setNotice('');
              if (signup) {
                const name = displayNameSchema.safeParse(data.get('name'));
                if (!name.success) {
                  setError(name.error.issues[0].message);
                  return;
                }
                const validation = confirmedPasswordError(
                  credentials.password,
                  String(data.get('confirmPassword')),
                );
                if (validation) {
                  setError(validation);
                  return;
                }
              }
              setBusy(true);
              try {
                const result = signup
                  ? await auth.signUp.email({
                      ...credentials,
                      name: displayNameSchema.parse(data.get('name')),
                      callbackURL: returnTo,
                    })
                  : await auth.signIn.email(credentials);
                if (result.error) {
                  if (result.error.status === 429)
                    setError(
                      'Too many attempts. Please wait a minute before trying again.',
                    );
                  else if (result.error.code === 'EMAIL_NOT_VERIFIED') {
                    setPendingEmail(credentials.email);
                    setCooldown(60);
                    form.reset();
                  } else
                    setError(
                      signup
                        ? 'We could not complete signup. Check your details and try again.'
                        : 'Unable to sign in with those details. Check your email and password, or use Google if you registered with Google.',
                    );
                } else if (signup) {
                  form.reset();
                  setPendingEmail(credentials.email);
                  setCooldown(60);
                } else {
                  router.push(returnTo);
                  router.refresh();
                }
              } catch {
                setError('Unable to connect. Please try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {signup && (
              <div>
                <label htmlFor="display-name">What should we call you?</label>
                <input
                  id="display-name"
                  name="name"
                  type="text"
                  placeholder="e.g. Tommy"
                  autoComplete="nickname"
                  required
                  maxLength={120}
                  disabled={busy}
                  aria-describedby="display-name-help"
                />
                <p id="display-name-help" className="field-help">
                  Your preferred name. This is how you’ll appear to people on
                  your trips.
                </p>
              </div>
            )}
            <label className="field">
              Email
              <input
                name="email"
                placeholder="you@example.com"
                type="email"
                required
                maxLength={320}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>
            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              name="password"
              required
              minLength={signup ? 12 : 1}
              maxLength={128}
              autoComplete={signup ? 'new-password' : 'current-password'}
              disabled={busy}
              aria-describedby={signup ? 'password-help' : undefined}
            />
            {signup && (
              <>
                <p id="password-help" className="field-help">
                  {PASSWORD_REQUIREMENTS} Password managers and pasting are
                  welcome.
                </p>
                <PasswordInput
                  label="Confirm password"
                  name="confirmPassword"
                  required
                  maxLength={128}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </>
            )}
            <button className="button" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="login-recovery">
            <a href="/forgot-password">Forgot password?</a>
          </p>
          {googleEnabled && (
            <>
              <p className="auth-divider">or continue with</p>
              <button
                className="button google"
                disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  setError('');
                  try {
                    const result = await auth.signIn.social({
                      provider: 'google',
                      callbackURL: returnTo,
                      errorCallbackURL: `/login?error=oauth&next=${encodeURIComponent(returnTo)}`,
                    });
                    if (result.error)
                      setError(
                        'Google sign-in could not start. Please try again.',
                      );
                  } catch {
                    setError('Unable to connect. Please try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue with Google
              </button>
            </>
          )}
          <button
            className="text-action auth-switch"
            disabled={busy}
            onClick={() => {
              setSignup(!signup);
              setError('');
            }}
          >
            {signup
              ? 'Already have an account? Sign in'
              : 'New here? Create an account'}
          </button>
        </>
      )}
    </section>
  );
}
