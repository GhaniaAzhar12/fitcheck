-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('PURCHASE', 'ANALYSIS', 'REFUND');

-- AlterTable
ALTER TABLE "usage_event" ADD COLUMN     "credit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "credit_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "stripeSessionId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_entry_stripeSessionId_key" ON "credit_entry"("stripeSessionId");

-- CreateIndex
CREATE INDEX "credit_entry_userId_createdAt_idx" ON "credit_entry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
