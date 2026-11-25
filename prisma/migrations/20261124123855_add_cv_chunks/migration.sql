-- pgvector, for meaning-based CV search (Neon supports it)
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterEnum
ALTER TYPE "UsageKind" ADD VALUE 'EMBED';

-- CreateTable
CREATE TABLE "cv_chunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "section" TEXT,
    "text" TEXT NOT NULL,
    "embedding" vector(768),
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cv_chunk_userId_idx" ON "cv_chunk"("userId");

-- AddForeignKey
ALTER TABLE "cv_chunk" ADD CONSTRAINT "cv_chunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
