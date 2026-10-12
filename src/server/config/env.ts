import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(ql)?:\/\//.test(value)),
});
export function readDatabaseEnv(
  input: Record<string, string | undefined> = process.env,
) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  return result.data;
}
