CREATE TYPE "NoteContentType" AS ENUM ('IMAGE', 'VIDEO');

ALTER TABLE "notes"
ADD COLUMN "contentType" "NoteContentType";

UPDATE "notes" SET "contentType" = 'IMAGE' WHERE "contentType" IS NULL;

ALTER TABLE "notes"
ALTER COLUMN "contentType" SET DEFAULT 'IMAGE',
ALTER COLUMN "contentType" SET NOT NULL;

CREATE TABLE "note_videos" (
  "id" UUID NOT NULL,
  "noteId" UUID NOT NULL,
  "videoObjectKey" VARCHAR(64) NOT NULL,
  "videoMimeType" VARCHAR(32) NOT NULL,
  "videoByteSize" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "videoCodec" VARCHAR(16) NOT NULL,
  "audioCodec" VARCHAR(16),
  "coverObjectKey" VARCHAR(64) NOT NULL,
  "coverMimeType" VARCHAR(16) NOT NULL,
  "coverByteSize" INTEGER NOT NULL,
  "coverWidth" INTEGER NOT NULL,
  "coverHeight" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_videos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "note_videos_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "note_videos_videoByteSize_check" CHECK ("videoByteSize" > 0 AND "videoByteSize" <= 104857600),
  CONSTRAINT "note_videos_durationMs_check" CHECK ("durationMs" >= 1000 AND "durationMs" <= 600000),
  CONSTRAINT "note_videos_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "coverWidth" > 0 AND "coverHeight" > 0),
  CONSTRAINT "note_videos_coverByteSize_check" CHECK ("coverByteSize" > 0 AND "coverByteSize" <= 10485760),
  CONSTRAINT "note_videos_videoMimeType_check" CHECK ("videoMimeType" = 'video/mp4'),
  CONSTRAINT "note_videos_videoCodec_check" CHECK ("videoCodec" = 'h264'),
  CONSTRAINT "note_videos_audioCodec_check" CHECK ("audioCodec" IS NULL OR "audioCodec" = 'aac'),
  CONSTRAINT "note_videos_coverMimeType_check" CHECK ("coverMimeType" IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE UNIQUE INDEX "note_videos_noteId_key" ON "note_videos"("noteId");
CREATE UNIQUE INDEX "note_videos_videoObjectKey_key" ON "note_videos"("videoObjectKey");
CREATE UNIQUE INDEX "note_videos_coverObjectKey_key" ON "note_videos"("coverObjectKey");
CREATE INDEX "note_videos_createdAt_id_idx" ON "note_videos"("createdAt" DESC, "id" DESC);
CREATE INDEX "notes_contentType_createdAt_id_idx" ON "notes"("contentType", "createdAt" DESC, "id" DESC);
CREATE INDEX "notes_channelId_contentType_createdAt_id_idx" ON "notes"("channelId", "contentType", "createdAt" DESC, "id" DESC);
CREATE INDEX "notes_authorId_contentType_createdAt_id_idx" ON "notes"("authorId", "contentType", "createdAt" DESC, "id" DESC);

CREATE OR REPLACE FUNCTION "enforce_note_media_shape"()
RETURNS TRIGGER AS $$
DECLARE
  target_note_id UUID;
  target_type "NoteContentType";
  image_count INTEGER;
  video_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'notes' THEN
    target_note_id := COALESCE(NEW."id", OLD."id");
  ELSE
    target_note_id := COALESCE(NEW."noteId", OLD."noteId");
  END IF;
  SELECT "contentType" INTO target_type FROM "notes" WHERE "id" = target_note_id;
  IF target_type IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO image_count FROM "note_images" WHERE "noteId" = target_note_id;
  SELECT count(*) INTO video_count FROM "note_videos" WHERE "noteId" = target_note_id;
  IF target_type = 'IMAGE' AND (image_count < 1 OR image_count > 9 OR video_count <> 0) THEN
    RAISE EXCEPTION 'invalid IMAGE note media shape' USING ERRCODE = '23514';
  END IF;
  IF target_type = 'VIDEO' AND (image_count <> 0 OR video_count <> 1) THEN
    RAISE EXCEPTION 'invalid VIDEO note media shape' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "notes_media_shape_check"
AFTER INSERT OR UPDATE OF "contentType" ON "notes"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "enforce_note_media_shape"();

CREATE CONSTRAINT TRIGGER "note_images_media_shape_check"
AFTER INSERT OR UPDATE OR DELETE ON "note_images"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "enforce_note_media_shape"();

CREATE CONSTRAINT TRIGGER "note_videos_media_shape_check"
AFTER INSERT OR UPDATE OR DELETE ON "note_videos"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "enforce_note_media_shape"();
