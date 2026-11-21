-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('EXTRACT', 'ANALYSIS', 'REPORT', 'TAILOR', 'INTERVIEW', 'KEY_CHECK');

-- CreateTable
CREATE TABLE "usage_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ownKey" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_event_userId_createdAt_idx" ON "usage_event"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_event_jobId_idx" ON "usage_event"("jobId");

-- AddForeignKey
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
