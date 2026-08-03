CREATE TYPE "LegalAcceptanceScene" AS ENUM ('REGISTRATION', 'LOGIN', 'RECONFIRMATION');

ALTER TABLE "users"
ADD COLUMN "ageRestrictedAt" TIMESTAMPTZ(3);

UPDATE "users"
SET "ageRestrictedAt" = CURRENT_TIMESTAMP
WHERE "birthDate" IS NOT NULL
  AND "birthDate" > (CURRENT_DATE - INTERVAL '14 years')::date;

CREATE TABLE "legal_acceptances" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "termsVersion" VARCHAR(64) NOT NULL,
  "privacyVersion" VARCHAR(64) NOT NULL,
  "scene" "LegalAcceptanceScene" NOT NULL,
  "evidenceKey" VARCHAR(160) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_acceptances_evidenceKey_key"
ON "legal_acceptances"("evidenceKey");

CREATE INDEX "legal_acceptances_userId_termsVersion_privacyVersion_idx"
ON "legal_acceptances"("userId", "termsVersion", "privacyVersion");

CREATE INDEX "legal_acceptances_userId_acceptedAt_idx"
ON "legal_acceptances"("userId", "acceptedAt" DESC);

ALTER TABLE "legal_acceptances"
ADD CONSTRAINT "legal_acceptances_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
