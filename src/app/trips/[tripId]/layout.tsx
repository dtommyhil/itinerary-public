import type { ReactNode } from 'react';
import { TripCardState } from '../card-state';

export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  return <TripCardState key={(await params).tripId}>{children}</TripCardState>;
}
