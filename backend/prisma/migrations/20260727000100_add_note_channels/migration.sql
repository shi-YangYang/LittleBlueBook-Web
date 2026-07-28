-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "publishable" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channels_code_format_check"
      CHECK ("code" ~ '^[a-z][a-z0-9-]{1,31}$'),
    CONSTRAINT "channels_name_length_check"
      CHECK (char_length(btrim("name")) BETWEEN 1 AND 20),
    CONSTRAINT "channels_display_order_check"
      CHECK ("displayOrder" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_code_key" ON "channels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "channels_displayOrder_key"
ON "channels"("displayOrder");

-- CreateIndex
CREATE INDEX "channels_isPublic_enabled_displayOrder_idx"
ON "channels"("isPublic", "enabled", "displayOrder");

-- Seed system channels. The conflict clause makes the channel initialization
-- safe to repeat without creating duplicate records.
INSERT INTO "channels"
  ("id", "code", "name", "displayOrder", "enabled", "publishable", "isPublic")
VALUES
  ('00000000-0000-4000-8001-000000000000', 'uncategorized', '未分类', 0, true, false, false),
  ('00000000-0000-4000-8001-000000000001', 'digital', '数码', 1, true, true, true),
  ('00000000-0000-4000-8001-000000000002', 'automotive', '汽车', 2, true, true, true),
  ('00000000-0000-4000-8001-000000000003', 'gaming', '游戏', 3, true, true, true),
  ('00000000-0000-4000-8001-000000000004', 'sports', '运动', 4, true, true, true),
  ('00000000-0000-4000-8001-000000000005', 'fitness', '健身', 5, true, true, true),
  ('00000000-0000-4000-8001-000000000006', 'outdoors', '户外', 6, true, true, true),
  ('00000000-0000-4000-8001-000000000007', 'fashion', '穿搭', 7, true, true, true),
  ('00000000-0000-4000-8001-000000000008', 'food', '美食', 8, true, true, true),
  ('00000000-0000-4000-8001-000000000009', 'workplace', '职场', 9, true, true, true),
  ('00000000-0000-4000-8001-000000000010', 'relationships', '情感', 10, true, true, true),
  ('00000000-0000-4000-8001-000000000011', 'home', '家居', 11, true, true, true),
  ('00000000-0000-4000-8001-000000000012', 'travel', '旅行', 12, true, true, true),
  ('00000000-0000-4000-8001-000000000013', 'other', '其它', 13, true, true, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "displayOrder" = EXCLUDED."displayOrder",
  "enabled" = EXCLUDED."enabled",
  "publishable" = EXCLUDED."publishable",
  "isPublic" = EXCLUDED."isPublic",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Add the relation as nullable while legacy notes are backfilled.
ALTER TABLE "notes" ADD COLUMN "channelId" UUID;

UPDATE "notes"
SET "channelId" = (
  SELECT "id" FROM "channels" WHERE "code" = 'uncategorized'
)
WHERE "channelId" IS NULL;

ALTER TABLE "notes" ALTER COLUMN "channelId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "notes_channelId_createdAt_id_idx"
ON "notes"("channelId", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "notes"
ADD CONSTRAINT "notes_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "channels"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
