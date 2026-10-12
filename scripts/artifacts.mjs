import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Test screenshots and metrics must work on both local macOS and Linux CI. */
export function artifactPath(name) {
  const path = join(tmpdir(), 'itinerary-test-artifacts', name);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
