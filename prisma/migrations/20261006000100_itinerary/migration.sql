ALTER TABLE "Trip" ADD COLUMN "itineraryVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ItineraryItem" ADD COLUMN "bookmarkId" UUID,
 ADD COLUMN "url" VARCHAR(4096),
 ADD CONSTRAINT "ItineraryItem_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "SavedPlace"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ItineraryItem_bookmarkId_idx" ON "ItineraryItem"("bookmarkId");
