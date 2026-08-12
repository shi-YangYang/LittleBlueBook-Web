CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ModerationStatus" AS ENUM ('VISIBLE', 'HIDDEN');
CREATE TYPE "ReportTargetType" AS ENUM ('NOTE', 'COMMENT', 'USER');
CREATE TYPE "ReportReason" AS ENUM (
  'SEXUAL',
  'VIOLENCE',
  'HATE',
  'HARASSMENT',
  'PERSONAL_ATTACK',
  'SPAM',
  'INFRINGEMENT',
  'OTHER'
);
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'ACTIONED', 'DISMISSED', 'TARGET_UNAVAILABLE');
CREATE TYPE "ModerationAction" AS ENUM (
  'DISMISS_REPORT',
  'HIDE_NOTE',
  'RESTORE_NOTE',
  'HIDE_COMMENT',
  'RESTORE_COMMENT',
  'SUSPEND_USER',
  'RESTORE_USER'
);

ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "users_authVersion_positive" CHECK ("authVersion" >= 1);

ALTER TABLE "notes"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE';

ALTER TABLE "note_comments"
  ADD COLUMN "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE';

ALTER TABLE "notifications"
  ADD COLUMN "suppressedAt" TIMESTAMPTZ(3);

CREATE TABLE "user_blocks" (
  "blockerId" UUID NOT NULL,
  "blockedId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_blocks_not_self" CHECK ("blockerId" <> "blockedId")
);

CREATE TABLE "reports" (
  "id" UUID NOT NULL,
  "reporterId" UUID NOT NULL,
  "targetType" "ReportTargetType" NOT NULL,
  "targetId" UUID NOT NULL,
  "reason" "ReportReason" NOT NULL,
  "details" VARCHAR(200),
  "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reports_details_length" CHECK ("details" IS NULL OR char_length("details") <= 200),
  CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "moderation_audits" (
  "id" UUID NOT NULL,
  "administratorId" UUID NOT NULL,
  "action" "ModerationAction" NOT NULL,
  "targetType" "ReportTargetType" NOT NULL,
  "targetId" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "previousState" VARCHAR(64) NOT NULL,
  "nextState" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "moderation_audits_reason_length" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
  CONSTRAINT "moderation_audits_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "user_blocks_blockerId_createdAt_blockedId_idx" ON "user_blocks"("blockerId", "createdAt" DESC, "blockedId" DESC);
CREATE INDEX "user_blocks_blockedId_blockerId_idx" ON "user_blocks"("blockedId", "blockerId");
CREATE INDEX "reports_reporterId_createdAt_id_idx" ON "reports"("reporterId", "createdAt" DESC, "id" DESC);
CREATE INDEX "reports_status_targetType_createdAt_id_idx" ON "reports"("status", "targetType", "createdAt" DESC, "id" DESC);
CREATE INDEX "reports_targetType_targetId_status_idx" ON "reports"("targetType", "targetId", "status");
CREATE UNIQUE INDEX "reports_one_pending_per_reporter_target_idx" ON "reports"("reporterId", "targetType", "targetId") WHERE "status" = 'PENDING';
CREATE INDEX "moderation_audits_targetType_targetId_createdAt_id_idx" ON "moderation_audits"("targetType", "targetId", "createdAt" DESC, "id" DESC);
CREATE INDEX "moderation_audits_administratorId_createdAt_id_idx" ON "moderation_audits"("administratorId", "createdAt" DESC, "id" DESC);
CREATE INDEX "notifications_recipientId_suppressedAt_createdAt_id_idx" ON "notifications"("recipientId", "suppressedAt", "createdAt" DESC, "id" DESC);
