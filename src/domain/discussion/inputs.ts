import { z } from 'zod';
export const targetInput = z.object({
  resourceType: z.enum(['bookmark', 'activity']),
  resourceId: z.uuid(),
});
export type DiscussionTarget = z.infer<typeof targetInput>;
export const commentBody = z
  .string()
  .trim()
  .min(1, 'Write a comment')
  .max(3000);
export const newCommentInput = targetInput.extend({ body: commentBody });
export const commentRevision = z.object({
  version: z.number().int().nonnegative(),
});
export const editCommentInput = commentRevision.extend({ body: commentBody });
export const voteInput = targetInput.extend({
  value: z.union([z.literal(0), z.literal(1)]),
});
export const pageInput = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
});
export const discussionInput = targetInput.extend(pageInput.shape);
