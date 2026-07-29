-- Enable the trusted trigram extension used by public content search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Support indexed substring matching for the public search fields.
CREATE INDEX "notes_title_trgm_idx"
ON "notes" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "notes_content_trgm_idx"
ON "notes" USING GIN ("content" gin_trgm_ops);

CREATE INDEX "users_nickname_trgm_idx"
ON "users" USING GIN ("nickname" gin_trgm_ops);

CREATE INDEX "users_littleBlueBookId_trgm_idx"
ON "users" USING GIN ("littleBlueBookId" gin_trgm_ops);
