"use server";

import { NoObjectGeneratedError } from "ai";
import { redirect } from "next/navigation";
import { z } from "zod";

import { aiChoiceFrom } from "@/lib/ai-choice";
import { aiErrorMessage, errorSummary } from "@/lib/ai-errors";
import { db } from "@/lib/db";
import { extractJob, JobTextError } from "@/lib/extract-job";
import { fetchJobPage, JobPageError } from "@/lib/fetch-job-page";
import { normalizeJobUrl } from "@/lib/job-url";
import { getModel } from "@/lib/model";
import { getSession } from "@/lib/session";
import { recordUsage } from "@/lib/usage";

export type CreateJobState = {
  error?: string;
  /** Echoed back so the form keeps what the user typed. */
  url?: string;
  text?: string;
};

const MAX_TEXT = 50_000;

const Input = z
  .object({
    url: z.string().trim().max(2_000, "That link is too long."),
    text: z.string().trim().max(MAX_TEXT, "That text is too long."),
  })
  .refine((v) => v.url || v.text, {
    message: "Paste a job link or the job text.",
  });

export async function createJob(
  _prev: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const raw = {
    url: String(formData.get("url") ?? ""),
    text: String(formData.get("text") ?? ""),
  };

  const session = await getSession();
  if (!session) return { ...raw, error: "Your session ended. Sign in again." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ...raw, error: parsed.error.issues[0]?.message };
  }
  const { url, text } = parsed.data;

  // Already saved? Open it instead of making a duplicate (and spending tokens).
  const existingId = await findExistingJob(session.user.id, url, text);
  if (existingId) redirect(`/jobs/${existingId}?existing=1`);

  let jobId: string;
  // The visitor's own key (if any) is used for this call only.
  const aiChoice = aiChoiceFrom(formData);
  const started = Date.now();
  try {
    // Pasted text wins: it's what the user actually sees.
    const rawText = text || (await fetchJobPage(url));
    const result = await extractJob(rawText, aiChoice);

    const job = await db.job.create({
      data: {
        userId: session.user.id,
        url: url || null,
        rawText,
        extracted: result.data,
      },
      select: { id: true },
    });
    jobId = job.id;
    await recordUsage({
      userId: session.user.id,
      jobId,
      kind: "EXTRACT",
      provider: result.provider,
      model: result.modelId,
      aiChoice,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ms: result.ms,
    });
  } catch (error) {
    console.error("[createJob]", errorSummary(error));
    // Page and text problems never reached the model; model failures did.
    if (!(error instanceof JobPageError || error instanceof JobTextError)) {
      const { provider, modelId } = getModel(aiChoice);
      await recordUsage({
        userId: session.user.id,
        kind: "EXTRACT",
        provider,
        model: modelId,
        aiChoice,
        ok: false,
        ms: Date.now() - started,
      });
    }
    return { ...raw, error: friendlyError(error) };
  }

  // Outside try/catch: redirect() works by throwing.
  // ?analyze=1 starts the fit analysis on arrival: paste → verdict in one go.
  redirect(`/jobs/${jobId}?analyze=1`);
}

/**
 * The user's saved job with the same link (ignoring tracking bits), or the
 * same text. The link is checked first: text sent by the bookmarklet can
 * differ a little each time (ads, "posted 3 days ago").
 */
async function findExistingJob(
  userId: string,
  url: string,
  text: string,
): Promise<string | null> {
  const wanted = url ? normalizeJobUrl(url) : null;
  if (wanted) {
    const saved = await db.job.findMany({
      where: { userId, url: { not: null } },
      select: { id: true, url: true },
      orderBy: { createdAt: "desc" },
    });
    const match = saved.find((j) => j.url && normalizeJobUrl(j.url) === wanted);
    if (match) return match.id;
  }
  if (text) {
    const same = await db.job.findFirst({
      where: { userId, rawText: text },
      select: { id: true },
    });
    if (same) return same.id;
  }
  return null;
}

function friendlyError(error: unknown): string {
  if (error instanceof JobPageError || error instanceof JobTextError) {
    return error.message;
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return "The AI couldn't make sense of that text. Check it's a full job post and try again.";
  }
  return (
    aiErrorMessage(error) ??
    "Something went wrong reading that job. Try again, or paste the text instead."
  );
}
