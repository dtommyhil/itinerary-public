import { z } from 'zod';
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter the name you’d like to use.')
  .max(120, 'Use 120 characters or fewer.');
