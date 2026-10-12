-- CreateTable
CREATE TABLE "TripInvitation" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "TripRole" NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TripInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripInvitation_email_expiresAt_idx" ON "TripInvitation"("email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripInvitation_tripId_email_key" ON "TripInvitation"("tripId", "email");

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_role_check" CHECK ("role" IN ('editor', 'viewer'));
