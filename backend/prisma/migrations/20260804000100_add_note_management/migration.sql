ALTER TABLE "notes"
ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "editedAt" TIMESTAMPTZ(3);

ALTER TABLE "notes"
ADD CONSTRAINT "notes_contentVersion_check" CHECK ("contentVersion" >= 1);

CREATE TYPE "MediaCleanupStatus" AS ENUM ('READY', 'CLEANING');

CREATE TABLE "media_cleanup" (
  "id" UUID NOT NULL,
  "objectKey" VARCHAR(64) NOT NULL,
  "status" "MediaCleanupStatus" NOT NULL DEFAULT 'READY',
  "leaseToken" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "media_cleanup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_cleanup_objectKey_key" ON "media_cleanup"("objectKey");
CREATE INDEX "media_cleanup_status_nextAttemptAt_idx" ON "media_cleanup"("status", "nextAttemptAt");
