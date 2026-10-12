export type TripRole = 'owner' | 'editor' | 'viewer';
export type TripPermission =
  | 'read'
  | 'manageTrip'
  | 'manageMembers'
  | 'inviteMembers'
  | 'editContent'
  | 'comment'
  | 'vote'
  | 'deleteTrip';
const permissions: Record<TripRole, readonly TripPermission[]> = {
  owner: [
    'read',
    'manageTrip',
    'manageMembers',
    'inviteMembers',
    'editContent',
    'comment',
    'vote',
    'deleteTrip',
  ],
  editor: [
    'read',
    'manageTrip',
    'inviteMembers',
    'editContent',
    'comment',
    'vote',
  ],
  viewer: ['read'],
};
/** Membership must come from the database, never a client-supplied role. */
export function hasTripPermission(
  role: TripRole | null,
  permission: TripPermission,
): boolean {
  return role !== null && permissions[role].includes(permission);
}
