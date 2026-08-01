CREATE TYPE "AvatarCleanupStatus" AS ENUM ('RESERVED', 'READY', 'CLEANING');

ALTER TABLE "avatar_cleanup"
  ADD COLUMN "status" "AvatarCleanupStatus",
  ADD COLUMN "leaseToken" UUID;

UPDATE "avatar_cleanup"
SET "status" = 'READY';

ALTER TABLE "avatar_cleanup"
  ALTER COLUMN "status" SET NOT NULL,
  ADD CONSTRAINT "avatar_cleanup_lease_state_check" CHECK (
    ("status" = 'READY' AND "leaseToken" IS NULL)
    OR
    ("status" IN ('RESERVED', 'CLEANING') AND "leaseToken" IS NOT NULL)
  );

DROP INDEX "avatar_cleanup_nextAttemptAt_idx";

CREATE INDEX "avatar_cleanup_status_nextAttemptAt_idx"
  ON "avatar_cleanup"("status", "nextAttemptAt");
