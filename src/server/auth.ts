import 'server-only';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { displayNameSchema } from '@/domain/auth/display-name';
import { passwordError } from '@/domain/auth/password';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { sendAuthEmail } from '@/server/email';
import { getDb } from '@/server/db/client';
let instance: ReturnType<typeof createAuth> | undefined;
let instanceDb: ReturnType<typeof getDb> | undefined;
export function getAuth() {
  const db = getDb();
  if (!instance || instanceDb !== db) {
    instance = createAuth();
    instanceDb = db;
  }
  return instance;
}
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL)
    throw new Error(
      'Configure BETTER_AUTH_SECRET (at least 32 characters) and BETTER_AUTH_URL',
    );
  return betterAuth({
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path === '/sign-up/email' ||
          (ctx.path === '/update-user' && ctx.body?.name !== undefined)
        ) {
          const name = displayNameSchema.safeParse(ctx.body?.name);
          if (!name.success)
            throw new APIError('BAD_REQUEST', {
              message: name.error.issues[0].message,
            });
          ctx.body.name = name.data;
        }
        const field =
          ctx.path === '/sign-up/email'
            ? 'password'
            : ['/reset-password', '/change-password', '/set-password'].includes(
                  ctx.path,
                )
              ? 'newPassword'
              : null;
        if (field) {
          const message = passwordError(ctx.body?.[field]);
          if (message) throw new APIError('BAD_REQUEST', { message });
        }
      }),
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-up/email': { window: 60, max: 5 },
        '/sign-in/email': { window: 60, max: 10 },
        '/send-verification-email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
      },
    },
    secret,
    baseURL,
    database: prismaAdapter(getDb(), { provider: 'postgresql' }),
    advanced: { database: { generateId: 'uuid' } },
    user: { fields: { image: 'avatarUrl' } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(user.email, 'Reset your itinerary password', url);
      },
    },
    emailVerification: {
      expiresIn: 3600,
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(user.email, 'Verify your itinerary email', url);
      },
    },
    account: { accountLinking: { enabled: false } },
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
  });
}
