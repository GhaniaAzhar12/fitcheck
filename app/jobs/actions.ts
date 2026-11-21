"use server";

import { APICallError, NoObjectGeneratedError } from "ai";
import { redirect } from "next/navigation";
import { z } from "zod";

import { aiChoiceFrom } from "@/lib/ai-choice";
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
    // Log a summary only: full errors can echo request details.
    console.error("[createJob]", {
      name: error instanceof Error ? error.name : typeof error,
      status: APICallError.isInstance(error) ? error.statusCode : undefined,
      message: error instanceof Error ? error.message.slice(0, 300) : undefined,
    });
    return { ...raw, error: friendlyError(error) };
  }

  // Outside try/catch: redirect() works by throwing.
  redirect(`/jobs/${jobId}`);
}

function friendlyError(error: unknown): string {
  if (error instanceof JobPageError || error instanceof JobTextError) {
    return error.message;
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "The AI model took too long to answer. Try again in a moment.";
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      return "The free AI quota is used up for now. Try again in a minute.";
    }
    if (error.statusCode && error.statusCode >= 500) {
      return "The AI model is busy right now. Try again in a moment.";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "The AI key was rejected. If you use your own key, check it in Set up → AI model.";
    }
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return "The AI couldn't make sense of that text. Check it's a full job post and try again.";
  }
  return "Something went wrong reading that job. Try again, or paste the text instead.";
}
