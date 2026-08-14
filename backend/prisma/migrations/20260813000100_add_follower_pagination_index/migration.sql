CREATE INDEX "user_follows_followedId_createdAt_followerId_idx"
ON "user_follows"("followedId", "createdAt" DESC, "followerId" DESC);
