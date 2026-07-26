CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'PRIVATE');

ALTER TABLE "users"
ADD COLUMN "littleBlueBookId" VARCHAR(10),
ADD COLUMN "gender" "Gender" NOT NULL DEFAULT 'PRIVATE';

WITH numbered_users AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS sequence_number
    FROM "users"
)
UPDATE "users" AS target
SET "littleBlueBookId" = LPAD(numbered_users.sequence_number::TEXT, 10, '0')
FROM numbered_users
WHERE target."id" = numbered_users."id";

ALTER TABLE "users"
ALTER COLUMN "littleBlueBookId" SET NOT NULL;

ALTER TABLE "users"
ADD CONSTRAINT "users_littleBlueBookId_format"
CHECK ("littleBlueBookId" ~ '^[0-9]{10}$');

CREATE UNIQUE INDEX "users_littleBlueBookId_key"
ON "users"("littleBlueBookId");
