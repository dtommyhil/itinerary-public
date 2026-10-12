import { expect, it } from 'vitest';
import { displayNameSchema } from '../src/domain/auth/display-name';
it.each(['Tommy', '李 明', 'María José', 'O’Connor', '🌻'])(
  'accepts preferred name %s',
  (name) => {
    expect(displayNameSchema.parse(name)).toBe(name);
  },
);
it('trims names and rejects blank or oversized names', () => {
  expect(displayNameSchema.parse('  Tommy  ')).toBe('Tommy');
  for (const name of ['', '   ', 'a'.repeat(121), null])
    expect(displayNameSchema.safeParse(name).success).toBe(false);
});
