import "server-only";

import type { AiChoice } from "@/lib/ai-choice";
import { db } from "@/lib/db";
import type { UsageKind } from "@/lib/generated/prisma/client";

/**
 * Free (app-key) analyses each user gets per rolling 24 hours. After that,
 * each analysis takes 1 bought credit (Stripe test mode).
 */
export const FREE_ANALYSES_PER_DAY = 3;

export type UsageRecord = {
  userId: string;
  jobId?: string | null;
  kind: UsageKind;
  provider: string;
  model: string;
  aiChoice?: AiChoice;
  /** A bought credit paid for this analysis. */
  credit?: boolean;
  ok?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  ms?: number;
};

/** Logs one model call. Never throws: usage logging must not break a feature. */
export async function recordUsage(r: UsageRecord): Promise<void> {
  try {
    await db.usageEvent.create({
      data: {
        userId: r.userId,
        jobId: r.jobId ?? null,
        kind: r.kind,
        provider: r.provider,
        model: r.model,
        ownKey: Boolean(r.aiChoice?.apiKey),
        credit: r.credit ?? false,
        ok: r.ok ?? true,
        inputTokens: r.inputTokens ?? 0,
        outputTokens: r.outputTokens ?? 0,
        ms: r.ms ?? 0,
      },
    });
  } catch (error) {
    console.error(
      "[usage] couldn't record",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Free analyses (app key, no credit spent) in the last 24 hours. */
export async function freeAnalysesToday(userId: string): Promise<number> {
  return db.usageEvent.count({
    where: {
      userId,
      kind: "ANALYSIS",
      ownKey: false,
      credit: false,
      provider: { not: "ollama" },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
}

/** True when the app's free quota isn't used: own key or a local model. */
export function usesOwnResources(aiChoice?: AiChoice): boolean {
  return Boolean(aiChoice?.apiKey) || aiChoice?.provider === "ollama";
}
