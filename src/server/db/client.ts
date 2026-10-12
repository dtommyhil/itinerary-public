import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { readDatabaseEnv } from '@/server/config/env';
const globalDb = globalThis as unknown as {
  db?: PrismaClient;
};
export function getDb(): PrismaClient {
  // Route bundles/hot reloads may have different constructor identities. Keep one
  // process-wide pool: replacing it can disconnect another request mid-transaction.
  // Restart the dev server after regenerating Prisma for a schema change.
  if (!globalDb.db) {
    const { DATABASE_URL } = readDatabaseEnv();
    globalDb.db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: DATABASE_URL,
        max: 10,
        connectionTimeoutMillis: 5000,
      }),
    });
  }
  return globalDb.db;
}
