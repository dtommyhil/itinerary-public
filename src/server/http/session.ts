import 'server-only';
import { getAuth } from '@/server/auth';
import { AppError } from './errors';
export async function requireSession(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new AppError('UNAUTHENTICATED', 'Please sign in');
  return session;
}
export function requireOrigin(request: Request) {
  const expected = process.env.BETTER_AUTH_URL;
  if (!expected || request.headers.get('origin') !== new URL(expected).origin)
    throw new AppError('FORBIDDEN', 'Invalid request origin');
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError('VALIDATION_ERROR', 'Expected JSON');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('VALIDATION_ERROR', 'Missing body');
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 1_000_000) {
      await reader.cancel();
      throw new AppError('VALIDATION_ERROR', 'Request too large');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid JSON');
  }
}
