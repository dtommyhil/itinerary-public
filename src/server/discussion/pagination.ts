import 'server-only';
import { z } from 'zod';
import { AppError } from '@/server/http/errors';
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError('VALIDATION_ERROR', result.error.issues[0].message);
  return result.data;
}
const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
export function olderThan(cursor?: string) {
  if (!cursor) return {};
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  }
  const { createdAt, id } = parse(cursorSchema, decoded);
  return {
    OR: [
      { createdAt: { lt: new Date(createdAt) } },
      { createdAt: new Date(createdAt), id: { lt: id } },
    ],
  };
}
export function nextCursor(
  rows: { id: string; createdAt: Date }[],
  limit: number,
) {
  const last = rows[limit - 1];
  return rows.length > limit
    ? Buffer.from(
        JSON.stringify({
          id: last.id,
          createdAt: last.createdAt.toISOString(),
        }),
      ).toString('base64url')
    : null;
}
