import { expect, it } from 'vitest';
import { commentPermissions } from '../src/domain/discussion/policies';
import {
  newCommentInput,
  editCommentInput,
  voteInput,
  discussionInput,
} from '../src/domain/discussion/inputs';
const target = {
  resourceType: 'bookmark',
  resourceId: '00000000-0000-4000-8000-000000000001',
};
it.each([
  ['owner', 'a', 'a', true, true],
  ['owner', 'a', 'b', false, false],
  ['editor', 'a', 'a', true, true],
  ['editor', 'a', 'b', false, false],
  ['viewer', 'a', 'a', false, false],
  ['viewer', 'a', 'b', false, false],
] as const)(
  'comment policy %s %s %s',
  (role, user, author, canEdit, canDelete) => {
    expect(commentPermissions(role, user, author)).toEqual({
      canEdit,
      canDelete,
    });
  },
);
it('trims comments and rejects blanks, oversized text, and invalid resources', () => {
  expect(
    newCommentInput.parse({ ...target, body: '  Meet here?  ' }).body,
  ).toBe('Meet here?');
  for (const body of ['', '   ', 'a'.repeat(3001)])
    expect(newCommentInput.safeParse({ ...target, body }).success).toBe(false);
  expect(
    newCommentInput.safeParse({ ...target, resourceType: 'trip', body: 'Hi' })
      .success,
  ).toBe(false);
  expect(
    newCommentInput.safeParse({ ...target, resourceId: 'bad', body: 'Hi' })
      .success,
  ).toBe(false);
});
it('requires a revision for edits and explicit desired vote state', () => {
  expect(editCommentInput.safeParse({ body: 'New' }).success).toBe(false);
  expect(editCommentInput.safeParse({ body: 'New', version: -1 }).success).toBe(
    false,
  );
  for (const value of [0, 1])
    expect(voteInput.safeParse({ ...target, value }).success).toBe(true);
  for (const value of [-1, 2, true, '1'])
    expect(voteInput.safeParse({ ...target, value }).success).toBe(false);
});
it('bounds discussion pagination', () => {
  expect(discussionInput.parse(target).limit).toBe(20);
  for (const limit of [0, 51, 'bad'])
    expect(discussionInput.safeParse({ ...target, limit }).success).toBe(false);
});
