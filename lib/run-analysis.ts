import "server-only";

import { findEvidence } from "@/lib/agent/find-evidence";
import { octokitRepoApi, type RepoApi } from "@/lib/agent/repo-files";
import { fitScore } from "@/lib/agent/score";
import type { AiChoice } from "@/lib/ai-choice";
import { aiErrorMessage, errorSummary } from "@/lib/ai-errors";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { GitHubError, githubFor } from "@/lib/github";
import { JobExtraction } from "@/lib/job-extraction";
import { getModel } from "@/lib/model";
import { isOnboarded } from "@/lib/onboarding";
import {
  FREE_ANALYSES_PER_DAY,
  freeAnalysesToday,
  recordUsage,
  usesOwnResources,
} from "@/lib/usage";

/** A message that is safe to show the user as-is. */
export class AnalysisError extends Error {}

/**
 * Runs the evidence agent for one of the user's jobs and saves the run.
 * Failed runs are saved too (status FAILED with the reason), then re-thrown.
 */
export async function runAnalysis({
  userId,
  jobId,
  aiChoice,
  github: githubOverride,
}: {
  userId: string;
  jobId: string;
  aiChoice?: AiChoice;
  /** Defaults to the user's GitHub login; scripts pass their own client. */
  github?: RepoApi;
}): Promise<{ analysisId: string; score: number | null }> {
  const job = await db.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true, extracted: true },
  });
  if (!job) throw new AnalysisError("That job wasn't found.");

  const extracted = JobExtraction.safeParse(job.extracted);
  if (!extracted.success) {
    throw new AnalysisError(
      "This job's requirements couldn't be read. Add it again.",
    );
  }

  const profile = await db.profile.findUnique({
    where: { userId },
    select: { cvText: true, repos: true },
  });
  if (!isOnboarded(profile) || !profile?.cvText) {
    throw new AnalysisError(
      "Finish Set up (CV and repos) before analysing a job.",
    );
  }

  // Protect the shared free tier: own keys and local models are unlimited.
  if (!usesOwnResources(aiChoice)) {
    const used = await freeAnalysesToday(userId);
    if (used >= FREE_ANALYSES_PER_DAY) {
      throw new AnalysisError(
        `You've used today's ${FREE_ANALYSES_PER_DAY} free analyses. Add your own API key in Set up to keep going, or try again tomorrow.`,
      );
    }
  }

  const { provider, modelId } = getModel(aiChoice);
  const started = Date.now();

  try {
    const github = githubOverride ?? octokitRepoApi(await githubFor(userId));
    const result = await findEvidence({
      job: extracted.data,
      cvText: profile.cvText,
      repos: profile.repos,
      github,
      modelOptions: aiChoice,
      onToolCall: (c) =>
        console.info(
          `[analysis ${job.id}] step ${c.step || "?"} ${c.ok ? "✓" : "✗"} ${c.tool} ${c.ms}ms · ${c.summary}`,
        ),
    });

    const score = fitScore(result.evidence);
    const analysis = await db.analysis.create({
      data: {
        jobId: job.id,
        status: "DONE",
        evidence: result.evidence,
        // Tool inputs come from the model as JSON, so this is safe to store.
        toolCalls: result.toolCalls as unknown as Prisma.InputJsonValue,
        score,
        provider: result.provider,
        model: result.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        steps: result.steps,
        ms: result.ms,
      },
      select: { id: true },
    });
    await recordUsage({
      userId,
      jobId: job.id,
      kind: "ANALYSIS",
      provider: result.provider,
      model: result.modelId,
      aiChoice,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: result.ms,
    });
    return { analysisId: analysis.id, score };
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.message
        : (aiErrorMessage(error) ?? "The analysis failed. Try again.");
    console.error(`[analysis ${job.id}]`, errorSummary(error));
    await db.analysis.create({
      data: {
        jobId: job.id,
        status: "FAILED",
        provider,
        model: modelId,
        ms: Date.now() - started,
        error: message,
      },
    });
    await recordUsage({
      userId,
      jobId: job.id,
      kind: "ANALYSIS",
      provider,
      model: modelId,
      aiChoice,
      ok: false,
      ms: Date.now() - started,
    });
    throw new AnalysisError(message);
  }
}
