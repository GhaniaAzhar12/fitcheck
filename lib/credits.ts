import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/** Bought credits the user has left (the sum of the ledger). */
export async function creditBalance(userId: string): Promise<number> {
  const { _sum } = await db.creditEntry.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return _sum.delta ?? 0;
}

/**
 * Takes 1 credit for an analysis, before it runs. Returns false when the
 * balance is 0. A per-user lock stops two analyses at once from spending
 * the same last credit.
 */
export async function spendCredit(
  userId: string,
  jobId: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const { _sum } = await tx.creditEntry.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    if ((_sum.delta ?? 0) < 1) return false;
    await tx.creditEntry.create({
      data: { userId, jobId, delta: -1, reason: "ANALYSIS" },
    });
    return true;
  });
}

/** Gives the credit back when a paid analysis fails. */
export async function refundCredit(userId: string, jobId: string) {
  await db.creditEntry.create({
    data: { userId, jobId, delta: 1, reason: "REFUND" },
  });
}

/**
 * Adds a bought pack. Safe to call more than once for the same Checkout
 * Session (webhook retries, the return page): only the first call adds.
 */
export async function addPurchasedCredits({
  userId,
  credits,
  stripeSessionId,
}: {
  userId: string;
  credits: number;
  stripeSessionId: string;
}): Promise<"added" | "already-added"> {
  try {
    await db.creditEntry.create({
      data: { userId, delta: credits, reason: "PURCHASE", stripeSessionId },
    });
    return "added";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "already-added";
    }
    throw error;
  }
}
