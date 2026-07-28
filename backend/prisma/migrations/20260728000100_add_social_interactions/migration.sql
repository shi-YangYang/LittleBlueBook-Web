-- CreateTable
CREATE TABLE "note_likes" (
    "userId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_likes_pkey" PRIMARY KEY ("userId", "noteId")
);

-- CreateTable
CREATE TABLE "note_favorites" (
    "userId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_favorites_pkey" PRIMARY KEY ("userId", "noteId")
);

-- CreateTable
CREATE TABLE "note_comments" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "note_comments_content_length_check"
      CHECK (char_length(btrim("content")) BETWEEN 1 AND 500)
);

-- CreateTable
CREATE TABLE "user_follows" (
    "followerId" UUID NOT NULL,
    "followedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("followerId", "followedId"),
    CONSTRAINT "user_follows_no_self_check"
      CHECK ("followerId" <> "followedId")
);

-- CreateIndex
CREATE INDEX "note_likes_noteId_idx" ON "note_likes"("noteId");

-- CreateIndex
CREATE INDEX "note_likes_userId_createdAt_noteId_idx"
ON "note_likes"("userId", "createdAt" DESC, "noteId" DESC);

-- CreateIndex
CREATE INDEX "note_favorites_noteId_idx" ON "note_favorites"("noteId");

-- CreateIndex
CREATE INDEX "note_favorites_userId_createdAt_noteId_idx"
ON "note_favorites"("userId", "createdAt" DESC, "noteId" DESC);

-- CreateIndex
CREATE INDEX "note_comments_noteId_createdAt_id_idx"
ON "note_comments"("noteId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "note_comments_authorId_idx" ON "note_comments"("authorId");

-- CreateIndex
CREATE INDEX "user_follows_followedId_idx" ON "user_follows"("followedId");

-- CreateIndex
CREATE INDEX "user_follows_followerId_createdAt_followedId_idx"
ON "user_follows"("followerId", "createdAt" DESC, "followedId" DESC);

-- AddForeignKey
ALTER TABLE "note_likes"
ADD CONSTRAINT "note_likes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_likes"
ADD CONSTRAINT "note_likes_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "notes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_favorites"
ADD CONSTRAINT "note_favorites_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_favorites"
ADD CONSTRAINT "note_favorites_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "notes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_comments"
ADD CONSTRAINT "note_comments_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "notes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_comments"
ADD CONSTRAINT "note_comments_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows"
ADD CONSTRAINT "user_follows_followerId_fkey"
FOREIGN KEY ("followerId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows"
ADD CONSTRAINT "user_follows_followedId_fkey"
FOREIGN KEY ("followedId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
