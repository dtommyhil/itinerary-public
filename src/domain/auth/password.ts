export const PASSWORD_REQUIREMENTS =
  'Use 12–128 characters, including an uppercase letter, a number, and a special character (such as !, @, or #).';
export function passwordError(password: unknown): string | null {
  return typeof password === 'string' &&
    password.length >= 12 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[\p{P}\p{S}]/u.test(password)
    ? null
    : PASSWORD_REQUIREMENTS;
}
export function confirmedPasswordError(
  password: string,
  confirmation: string,
): string | null {
  return (
    passwordError(password) ??
    (password === confirmation ? null : 'Passwords do not match.')
  );
}
