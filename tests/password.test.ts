import { expect, it } from 'vitest';
import {
  confirmedPasswordError,
  passwordError,
} from '../src/domain/auth/password';
it.each([
  'lowercase123!',
  'UppercaseOnly!',
  'NoSymbols1234',
  'Short1!',
  'Whitespace12 ',
  'A1!' + 'a'.repeat(126),
  null,
])('rejects invalid new password %s', (password) => {
  expect(passwordError(password)).not.toBeNull();
});
it('accepts required character classes and matching confirmation', () => {
  expect(passwordError('LongPassword1!')).toBeNull();
  expect(confirmedPasswordError('LongPassword1!', 'LongPassword1!')).toBeNull();
  expect(confirmedPasswordError('LongPassword1!', 'LongPassword2!')).toBe(
    'Passwords do not match.',
  );
});
