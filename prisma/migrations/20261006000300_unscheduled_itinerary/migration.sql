-- A null date represents the one unscheduled activity list for a trip.
ALTER TABLE "ItineraryDay" ALTER COLUMN "date" DROP NOT NULL;
CREATE UNIQUE INDEX "ItineraryDay_one_unscheduled_per_trip" ON "ItineraryDay" ("tripId") WHERE "date" IS NULL;
