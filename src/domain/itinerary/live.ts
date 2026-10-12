import { z } from 'zod';

const message = z.object({
  type: z.literal('itinerary.changed'),
  version: z.number().int().nonnegative(),
  role: z.enum(['owner', 'editor', 'viewer']),
});
/** Treat sockets as an untrusted transport; revisions are snapshot watermarks. */
export function parseLiveMessage(input: string) {
  try {
    const result = message.safeParse(JSON.parse(input));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function reconnectDelay(attempt: number, random = Math.random()) {
  return Math.min(15000, 500 * 2 ** Math.min(attempt, 5)) + random * 500;
}
