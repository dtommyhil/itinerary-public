ALTER TABLE "Trip" ADD COLUMN "links" JSONB NOT NULL DEFAULT '[]';

-- Preserve previously saved trip resources as the first unnamed link.
UPDATE "Trip" SET "links" = jsonb_build_array(jsonb_build_object('label', '', 'url', "link"))
WHERE "link" IS NOT NULL;
