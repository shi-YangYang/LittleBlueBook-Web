-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notes_title_length_check"
      CHECK (char_length(btrim("title")) BETWEEN 1 AND 50),
    CONSTRAINT "notes_content_length_check"
      CHECK (char_length(btrim("content")) BETWEEN 1 AND 2000)
);

-- CreateTable
CREATE TABLE "note_images" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "objectKey" VARCHAR(64) NOT NULL,
    "mimeType" VARCHAR(16) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "note_images_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "note_images_mime_type_check"
      CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT "note_images_byte_size_check"
      CHECK ("byteSize" BETWEEN 1 AND 10485760),
    CONSTRAINT "note_images_dimensions_check"
      CHECK ("width" > 0 AND "height" > 0),
    CONSTRAINT "note_images_order_check"
      CHECK ("order" BETWEEN 0 AND 8)
);

-- CreateIndex
CREATE UNIQUE INDEX "notes_authorId_clientRequestId_key"
ON "notes"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "notes_createdAt_id_idx"
ON "notes"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notes_authorId_createdAt_id_idx"
ON "notes"("authorId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "note_images_objectKey_key"
ON "note_images"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "note_images_noteId_order_key"
ON "note_images"("noteId", "order");

-- AddForeignKey
ALTER TABLE "notes"
ADD CONSTRAINT "notes_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_images"
ADD CONSTRAINT "note_images_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "notes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
