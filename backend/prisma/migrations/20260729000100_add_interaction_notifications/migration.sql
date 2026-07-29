-- SPEC-009 creates only future notifications. This migration intentionally
-- creates no rows from existing interaction tables.
CREATE TYPE "NotificationType" AS ENUM (
  'NOTE_LIKED',
  'NOTE_FAVORITED',
  'NOTE_COMMENTED',
  'USER_FOLLOWED'
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "recipientId" UUID NOT NULL,
  "actorId" UUID,
  "noteId" UUID,
  "commentId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(3),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_recipientId_createdAt_id_idx"
  ON "notifications" ("recipientId", "createdAt" DESC, "id" DESC);

CREATE INDEX "notifications_recipientId_type_createdAt_id_idx"
  ON "notifications" ("recipientId", "type", "createdAt" DESC, "id" DESC);

CREATE INDEX "notifications_recipientId_readAt_idx"
  ON "notifications" ("recipientId", "readAt");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "notes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "note_comments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
