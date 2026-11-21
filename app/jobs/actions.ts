"use server";

import { NoObjectGeneratedError } from "ai";
import { redirect } from "next/navigation";
import { z } from "zod";

import { aiChoiceFrom } from "@/lib/ai-choice";
import { aiErrorMessage, errorSummary } from "@/lib/ai-errors";
import { db } from "@/lib/db";
import { extractJob, JobTextError } from "@/lib/extract-job";
import { fetchJobPage, JobPageError } from "@/lib/fetch-job-page";
import { getSession } from "@/lib/session";

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

  let jobId: string;
  try {
    // Pasted text wins: it's what the user actually sees.
    const rawText = text || (await fetchJobPage(url));
    // The visitor's own key (if any) is used for this call only.
    const result = await extractJob(rawText, aiChoiceFrom(formData));

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
  } catch (error) {
    console.error("[createJob]", errorSummary(error));
    return { ...raw, error: friendlyError(error) };
  }

  // Outside try/catch: redirect() works by throwing.
  redirect(`/jobs/${jobId}`);
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
