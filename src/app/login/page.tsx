export const dynamic = 'force-dynamic';
import { authReturnPath } from '@/domain/auth/return-path';
import { LoginForm } from './login-form';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <main className="reference-ui auth-page login-page">
      <div className="auth-box">
        <div className="wordmark">itinerary</div>
        <LoginForm
          returnTo={authReturnPath(next)}
          callbackError={Boolean(error)}
          googleEnabled={Boolean(
            process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
          )}
        />
      </div>
    </main>
  );
}
