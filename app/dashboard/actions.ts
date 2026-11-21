"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { followUpToDate, JOB_STATUSES } from "@/lib/tracker";

export type TrackerResult = { ok: true } | { ok: false; error: string };

const JobId = z.string().min(1).max(100);

/** Runs an update only if the job belongs to the signed-in user. */
async function updateOwnJob(
  jobId: string,
  data: Parameters<typeof db.job.updateMany>[0]["data"],
): Promise<TrackerResult> {
  const session = await getSession();
  if (!session)
    return { ok: false, error: "Your session ended. Sign in again." };

  const { count } = await db.job.updateMany({
    where: { id: jobId, userId: session.user.id },
    data,
  });
  if (!count) return { ok: false, error: "That job wasn't found." };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateJobStatus(
  jobId: string,
  status: string,
): Promise<TrackerResult> {
  const parsed = z
    .object({ jobId: JobId, status: z.enum(JOB_STATUSES) })
    .safeParse({ jobId, status });
  if (!parsed.success) return { ok: false, error: "That status isn't valid." };
  return updateOwnJob(parsed.data.jobId, { status: parsed.data.status });
}

/** day is "YYYY-MM-DD", or "" to clear the follow-up. */
export async function updateFollowUp(
  jobId: string,
  day: string,
): Promise<TrackerResult> {
  const parsed = z
    .object({
      jobId: JobId,
      day: z.union([z.literal(""), z.iso.date()]),
    })
    .safeParse({ jobId, day });
  if (!parsed.success) return { ok: false, error: "That date isn't valid." };
  return updateOwnJob(parsed.data.jobId, {
    followUpAt: parsed.data.day ? followUpToDate(parsed.data.day) : null,
  });
}

/** Permanently deletes one of the user's jobs and its analyses. */
export async function deleteJob(jobId: string): Promise<TrackerResult> {
  const parsed = JobId.safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "That job wasn't found." };

  const session = await getSession();
  if (!session)
    return { ok: false, error: "Your session ended. Sign in again." };

  const { count } = await db.job.deleteMany({
    where: { id: parsed.data, userId: session.user.id },
  });
  if (!count) return { ok: false, error: "That job wasn't found." };

  revalidatePath("/dashboard");
  return { ok: true };
}
