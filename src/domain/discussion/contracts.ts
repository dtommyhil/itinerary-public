export type CommentView = {
  id: string;
  body: string;
  version: number;
  author: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};
export type VoteView = { count: number; mine: boolean; canVote: boolean };
export type DiscussionSummary = { comments: number; votes: VoteView };
export type DiscussionView = {
  total: number;
  items: CommentView[];
  nextCursor: string | null;
  canComment: boolean;
  votes: VoteView;
};
export const activityLabels = {
  'invitation.linkCreated': 'created a read-only invitation link',
  'invitation.linkRevoked': 'revoked read-only invitation links',
  'trip.created': 'created the trip',
  'trip.updated': 'updated trip details',
  'member.joined': 'joined the trip',
  'member.left': 'left the trip',
  'member.removed': 'removed a member',
  'member.role': 'changed a member’s role',
  'member.transfer': 'transferred trip ownership',
  'invitation.sent': 'created or renewed an invitation',
  'invitation.revoked': 'revoked an invitation',
  'bookmark.created': 'added a bookmark',
  'bookmark.updated': 'updated a bookmark',
  'bookmark.deleted': 'removed a bookmark',
  'collection.created': 'created a collection',
  'collection.updated': 'renamed a collection',
  'collection.deleted': 'removed a collection',
  'day.created': 'added a day',
  'day.updated': 'changed a day’s date',
  'day.deleted': 'removed a day and its activities',
  'activity.created': 'added an activity',
  'activity.updated': 'updated an activity',
  'activity.deleted': 'removed an activity',
  'activity.reordered': 'reordered a day',
  'comment.created': 'added a comment',
  'comment.updated': 'edited a comment',
  'comment.deleted': 'removed a comment',
  'vote.added': 'voted for an idea',
  'vote.removed': 'removed a vote',
} as const;
export type ActivityAction = keyof typeof activityLabels;
export type FeedView = {
  items: {
    id: string;
    actor: string;
    description: string;
    title: string | null;
    createdAt: string;
  }[];
  nextCursor: string | null;
};
