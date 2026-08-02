-- SPEC-011 extends existing comments without changing historical rows.
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_REPLIED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_LIKED';

CREATE TYPE "ViewSubjectType" AS ENUM ('AUTHENTICATED', 'ANONYMOUS');

ALTER TABLE "notes"
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "notes_viewCount_nonnegative_check" CHECK ("viewCount" >= 0);

ALTER TABLE "note_comments"
  ADD COLUMN "rootCommentId" UUID,
  ADD COLUMN "replyToId" UUID,
  ADD COLUMN "replyToAuthorId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

ALTER TABLE "note_comments"
  DROP CONSTRAINT "note_comments_content_length_check",
  ADD CONSTRAINT "note_comments_content_length_check" CHECK (
    ("deletedAt" IS NULL AND char_length(btrim("content")) BETWEEN 1 AND 500)
    OR ("deletedAt" IS NOT NULL AND "content" = '')
  ),
  ADD CONSTRAINT "note_comments_reply_shape_check" CHECK (
    ("rootCommentId" IS NULL AND "replyToId" IS NULL AND "replyToAuthorId" IS NULL)
    OR
    ("rootCommentId" IS NOT NULL AND "replyToId" IS NOT NULL AND "replyToAuthorId" IS NOT NULL
      AND "rootCommentId" <> "id" AND "replyToId" <> "id")
  );

CREATE INDEX "note_comments_rootCommentId_createdAt_id_idx"
  ON "note_comments" ("rootCommentId", "createdAt" ASC, "id" ASC);
CREATE INDEX "note_comments_replyToId_idx" ON "note_comments" ("replyToId");

ALTER TABLE "note_comments"
  ADD CONSTRAINT "note_comments_rootCommentId_fkey"
  FOREIGN KEY ("rootCommentId") REFERENCES "note_comments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "note_comments_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "note_comments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "note_comments_replyToAuthorId_fkey"
  FOREIGN KEY ("replyToAuthorId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "comment_likes" (
  "userId" UUID NOT NULL,
  "commentId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("userId", "commentId"),
  CONSTRAINT "comment_likes_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comment_likes_commentId_fkey" FOREIGN KEY ("commentId")
    REFERENCES "note_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "comment_likes_commentId_idx" ON "comment_likes" ("commentId");
CREATE INDEX "comment_likes_userId_createdAt_commentId_idx"
  ON "comment_likes" ("userId", "createdAt" DESC, "commentId" DESC);

CREATE TABLE "note_view_subjects" (
  "noteId" UUID NOT NULL,
  "subjectType" "ViewSubjectType" NOT NULL,
  "subjectHash" VARCHAR(64) NOT NULL,
  "lastViewedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "note_view_subjects_pkey"
    PRIMARY KEY ("noteId", "subjectType", "subjectHash"),
  CONSTRAINT "note_view_subjects_hash_check"
    CHECK ("subjectHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "note_view_subjects_noteId_fkey" FOREIGN KEY ("noteId")
    REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "note_view_subjects_lastViewedAt_idx"
  ON "note_view_subjects" ("lastViewedAt");

CREATE TABLE "direct_conversations" (
  "id" UUID NOT NULL,
  "firstParticipantId" UUID NOT NULL,
  "secondParticipantId" UUID NOT NULL,
  "firstParticipantReadMessageId" UUID,
  "firstParticipantReadAt" TIMESTAMPTZ(3),
  "secondParticipantReadMessageId" UUID,
  "secondParticipantReadAt" TIMESTAMPTZ(3),
  "lastMessageAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "direct_conversations_participant_order_check"
    CHECK ("firstParticipantId" < "secondParticipantId"),
  CONSTRAINT "direct_conversations_firstParticipantId_fkey"
    FOREIGN KEY ("firstParticipantId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "direct_conversations_secondParticipantId_fkey"
    FOREIGN KEY ("secondParticipantId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "direct_conversations_firstParticipantId_secondParticipantId_key"
  ON "direct_conversations" ("firstParticipantId", "secondParticipantId");
CREATE INDEX "direct_conversations_firstParticipantId_lastMessageAt_id_idx"
  ON "direct_conversations" ("firstParticipantId", "lastMessageAt" DESC, "id" DESC);
CREATE INDEX "direct_conversations_secondParticipantId_lastMessageAt_id_idx"
  ON "direct_conversations" ("secondParticipantId", "lastMessageAt" DESC, "id" DESC);

CREATE TABLE "direct_messages" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "content" VARCHAR(1000) NOT NULL,
  "clientRequestId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "direct_messages_content_check"
    CHECK (char_length(btrim("content")) BETWEEN 1 AND 1000),
  CONSTRAINT "direct_messages_client_request_id_check"
    CHECK (char_length("clientRequestId") BETWEEN 1 AND 100),
  CONSTRAINT "direct_messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "direct_conversations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "direct_messages_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "direct_messages_senderId_clientRequestId_key"
  ON "direct_messages" ("senderId", "clientRequestId");
CREATE INDEX "direct_messages_conversationId_createdAt_id_idx"
  ON "direct_messages" ("conversationId", "createdAt" DESC, "id" DESC);

ALTER TABLE "direct_conversations"
  ADD CONSTRAINT "direct_conversations_firstParticipantReadMessageId_fkey"
  FOREIGN KEY ("firstParticipantReadMessageId") REFERENCES "direct_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "direct_conversations_secondParticipantReadMessageId_fkey"
  FOREIGN KEY ("secondParticipantReadMessageId") REFERENCES "direct_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
