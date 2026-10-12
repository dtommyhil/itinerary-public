import { hasTripPermission, type TripRole } from '@/domain/trips/policies';
export function commentPermissions(
  role: TripRole,
  userId: string,
  authorId: string,
) {
  const canComment = hasTripPermission(role, 'comment');
  return {
    canEdit: canComment && userId === authorId,
    canDelete: canComment && userId === authorId,
  };
}
