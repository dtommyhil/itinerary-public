-- Evolve the existing table in place: preserve IDs, attribution, notes and Place links.
ALTER TABLE "SavedPlace" ADD COLUMN "title" VARCHAR(200),
 ADD COLUMN "url" VARCHAR(4096),
 ADD COLUMN "category" "PlaceCategory" NOT NULL DEFAULT 'other',
 ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "SavedPlace" s SET "title"=p.name, "category"=p.category,
 "url"=CASE WHEN jsonb_typeof(p.metadata->'googleMapsUrl')='string'
 THEN p.metadata->>'googleMapsUrl' ELSE NULL END,
 "updatedAt"=s."createdAt"
FROM "Place" p WHERE p.id=s."placeId";
ALTER TABLE "SavedPlace" ALTER COLUMN "title" SET NOT NULL,
 ALTER COLUMN "placeId" DROP NOT NULL,
 ADD CONSTRAINT "Bookmark_title_nonempty" CHECK (length(trim("title")) > 0);
CREATE UNIQUE INDEX "SavedPlace_id_tripId_key" ON "SavedPlace"(id,"tripId");
CREATE INDEX "SavedPlace_tripId_category_id_idx" ON "SavedPlace"("tripId",category,id);
CREATE TABLE "Collection" (
 id UUID PRIMARY KEY, "tripId" UUID NOT NULL REFERENCES "Trip"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 name VARCHAR(80) NOT NULL CHECK(length(trim(name)) > 0),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Collection_id_tripId_key" ON "Collection"(id,"tripId");
CREATE UNIQUE INDEX "Collection_tripId_name_key" ON "Collection"("tripId",name);
CREATE TABLE "BookmarkCollection" (
 "tripId" UUID NOT NULL, "bookmarkId" UUID NOT NULL, "collectionId" UUID NOT NULL,
 PRIMARY KEY ("bookmarkId","collectionId"),
 FOREIGN KEY ("bookmarkId","tripId") REFERENCES "SavedPlace"(id,"tripId") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("collectionId","tripId") REFERENCES "Collection"(id,"tripId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BookmarkCollection_collectionId_tripId_idx" ON "BookmarkCollection"("collectionId","tripId");
