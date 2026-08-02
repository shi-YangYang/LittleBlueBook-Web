-- Preserve structural comment placeholders instead of cascading through reply chains.
ALTER TABLE "note_comments"
  DROP CONSTRAINT "note_comments_rootCommentId_fkey",
  DROP CONSTRAINT "note_comments_replyToId_fkey";

ALTER TABLE "note_comments"
  ADD CONSTRAINT "note_comments_rootCommentId_fkey"
  FOREIGN KEY ("rootCommentId") REFERENCES "note_comments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "note_comments_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "note_comments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
