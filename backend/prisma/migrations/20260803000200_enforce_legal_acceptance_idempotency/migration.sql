-- Exact duplicates created before the database-level idempotency constraint do
-- not represent distinct acceptances. Keep the earliest server timestamp while
-- preserving every distinct document-version and acceptance-scene record.
WITH "ranked_acceptances" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "termsVersion", "privacyVersion", "scene"
      ORDER BY "acceptedAt" ASC, "id" ASC
    ) AS "duplicate_rank"
  FROM "legal_acceptances"
)
DELETE FROM "legal_acceptances" AS "acceptance"
USING "ranked_acceptances" AS "ranked"
WHERE "acceptance"."id" = "ranked"."id"
  AND "ranked"."duplicate_rank" > 1;

CREATE UNIQUE INDEX "legal_acceptances_userId_termsVersion_privacyVersion_scene_key"
ON "legal_acceptances"("userId", "termsVersion", "privacyVersion", "scene");
