-- Keep the applied migration history intact. Never silently delete saved activities.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ItineraryItem" i JOIN "ItineraryDay" d ON d.id = i."itineraryDayId" WHERE d.date IS NULL) THEN
    RAISE EXCEPTION 'Assign dates to existing undated activities before applying this migration';
  END IF;
END $$;
DELETE FROM "ItineraryDay" WHERE date IS NULL;
DROP INDEX "ItineraryDay_one_unscheduled_per_trip";
ALTER TABLE "ItineraryDay" ALTER COLUMN "date" SET NOT NULL;
