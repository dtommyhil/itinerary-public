-- DropForeignKey
ALTER TABLE "ItineraryItem" DROP CONSTRAINT "ItineraryItem_itineraryDayId_fkey";

-- AlterTable
-- Backfill before requiring tripId so existing schedules remain intact.
ALTER TABLE "ItineraryItem" ADD COLUMN "tripId" UUID;
UPDATE "ItineraryItem" item SET "tripId" = day."tripId" FROM "ItineraryDay" day WHERE item."itineraryDayId" = day.id;
ALTER TABLE "ItineraryItem" ALTER COLUMN "tripId" SET NOT NULL;

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookmarkId" UUID,
    "activityId" UUID,
    "body" VARCHAR(3000) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bookmarkId" UUID,
    "activityId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entityId" UUID NOT NULL,
    "title" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_tripId_bookmarkId_createdAt_id_idx" ON "Comment"("tripId", "bookmarkId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Comment_tripId_activityId_createdAt_id_idx" ON "Comment"("tripId", "activityId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Vote_tripId_bookmarkId_idx" ON "Vote"("tripId", "bookmarkId");

-- CreateIndex
CREATE INDEX "Vote_tripId_activityId_idx" ON "Vote"("tripId", "activityId");

-- CreateIndex
CREATE INDEX "Vote_userId_idx" ON "Vote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_bookmarkId_userId_key" ON "Vote"("bookmarkId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_activityId_userId_key" ON "Vote"("activityId", "userId");

-- CreateIndex
CREATE INDEX "ActivityLog_tripId_createdAt_id_idx" ON "ActivityLog"("tripId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryDay_id_tripId_key" ON "ItineraryDay"("id", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryItem_id_tripId_key" ON "ItineraryItem"("id", "tripId");

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_itineraryDayId_tripId_fkey" FOREIGN KEY ("itineraryDayId", "tripId") REFERENCES "ItineraryDay"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_bookmarkId_tripId_fkey" FOREIGN KEY ("bookmarkId", "tripId") REFERENCES "SavedPlace"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_activityId_tripId_fkey" FOREIGN KEY ("activityId", "tripId") REFERENCES "ItineraryItem"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_bookmarkId_tripId_fkey" FOREIGN KEY ("bookmarkId", "tripId") REFERENCES "SavedPlace"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_activityId_tripId_fkey" FOREIGN KEY ("activityId", "tripId") REFERENCES "ItineraryItem"("id", "tripId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Exactly one concrete resource per discussion entry. Composite FKs enforce trip isolation.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_one_target_check" CHECK (num_nonnulls("bookmarkId", "activityId") = 1),
 ADD CONSTRAINT "Comment_body_check" CHECK (length(btrim(body)) > 0),
 ADD CONSTRAINT "Comment_version_check" CHECK (version >= 0);
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_one_target_check" CHECK (num_nonnulls("bookmarkId", "activityId") = 1);
