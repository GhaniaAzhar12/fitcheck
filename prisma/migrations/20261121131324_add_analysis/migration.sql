-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('DONE', 'FAILED');

-- CreateTable
CREATE TABLE "analysis" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "evidence" JSONB,
    "toolCalls" JSONB,
    "report" TEXT,
    "score" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_jobId_createdAt_idx" ON "analysis"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "analysis" ADD CONSTRAINT "analysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
