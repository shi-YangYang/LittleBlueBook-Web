ALTER TABLE "users"
  ADD COLUMN "birthDate" DATE,
  ADD COLUMN "showAge" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bio" VARCHAR(100),
  ADD COLUMN "avatarObjectKey" VARCHAR(64),
  ADD COLUMN "profileVersion" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "users_avatarObjectKey_key"
  ON "users"("avatarObjectKey");

CREATE TABLE "avatar_cleanup" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "objectKey" VARCHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "avatar_cleanup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "avatar_cleanup_objectKey_key"
  ON "avatar_cleanup"("objectKey");

CREATE INDEX "avatar_cleanup_nextAttemptAt_idx"
  ON "avatar_cleanup"("nextAttemptAt");

ALTER TABLE "avatar_cleanup"
  ADD CONSTRAINT "avatar_cleanup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
