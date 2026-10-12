ALTER TABLE "Trip" ADD COLUMN "detailsVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SavedPlace" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_detailsVersion_nonnegative" CHECK ("detailsVersion" >= 0);
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_version_nonnegative" CHECK ("version" >= 0);
