-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TripRole" AS ENUM ('owner', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('restaurant', 'cafe', 'bar', 'attraction', 'hotel', 'activity', 'other');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "timezone" VARCHAR(100) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMember" (
    "userId" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "role" "TripRole" NOT NULL DEFAULT 'viewer',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("tripId","userId")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "PlaceCategory" NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPlace" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "savedBy" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryDay" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItineraryDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryItem" (
    "id" UUID NOT NULL,
    "itineraryDayId" UUID NOT NULL,
    "placeId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMPTZ(3),
    "endTime" TIMESTAMPTZ(3),
    "position" INTEGER NOT NULL,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ItineraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Trip_createdBy_idx" ON "Trip"("createdBy");

-- CreateIndex
CREATE INDEX "TripMember_userId_tripId_idx" ON "TripMember"("userId", "tripId");

-- CreateIndex
CREATE INDEX "SavedPlace_tripId_createdAt_id_idx" ON "SavedPlace"("tripId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SavedPlace_placeId_idx" ON "SavedPlace"("placeId");

-- CreateIndex
CREATE INDEX "SavedPlace_savedBy_idx" ON "SavedPlace"("savedBy");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPlace_tripId_placeId_key" ON "SavedPlace"("tripId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryDay_tripId_date_key" ON "ItineraryDay"("tripId", "date");

-- CreateIndex
CREATE INDEX "ItineraryItem_placeId_idx" ON "ItineraryItem"("placeId");

-- CreateIndex
CREATE INDEX "ItineraryItem_createdBy_idx" ON "ItineraryItem"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryItem_itineraryDayId_position_key" ON "ItineraryItem"("itineraryDayId", "position");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_savedBy_fkey" FOREIGN KEY ("savedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryDay" ADD CONSTRAINT "ItineraryDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_itineraryDayId_fkey" FOREIGN KEY ("itineraryDayId") REFERENCES "ItineraryDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Cross-column invariants are maintained in SQL because Prisma cannot express CHECKs.
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(trim("email")) AND length("email") > 0);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_date_range" CHECK (("startDate" IS NULL AND "endDate" IS NULL) OR ("startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" >= "startDate"));
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_name_nonempty" CHECK (length(trim("name")) > 0);
ALTER TABLE "Place" ADD CONSTRAINT "Place_coordinates" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_time_range" CHECK ("endTime" IS NULL OR ("startTime" IS NOT NULL AND "endTime" >= "startTime"));
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_title_nonempty" CHECK (length(trim("title")) > 0);
-- At most one owner; creation/transfer must ensure at least one inside a transaction.
CREATE UNIQUE INDEX "TripMember_one_owner" ON "TripMember" ("tripId") WHERE "role" = 'owner';
