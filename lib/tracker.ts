import { JobExtraction } from "@/lib/job-extraction";

// Rows for the dashboard tracker. Pure functions so they're easy to test;
// the database query lives in the dashboard page.

export const JOB_STATUSES = [
  "SAVED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type TrackerRow = {
  id: string;
  company: string | null;
  role: string;
  /** From the latest successful analysis; null if never analysed. */
  score: number | null;
  status: JobStatus;
  followUpAt: Date | null;
  /** The later of the job's last edit and its last analysis. */
  updatedAt: Date;
};

export type JobWithLatestAnalysis = {
  id: string;
  extracted: unknown;
  status: JobStatus;
  followUpAt: Date | null;
  updatedAt: Date;
  analyses: { score: number | null; createdAt: Date }[];
};

export function toTrackerRow(job: JobWithLatestAnalysis): TrackerRow {
  const data = JobExtraction.safeParse(job.extracted).data;
  const latest = job.analyses[0];
  return {
    id: job.id,
    company: data?.company ?? null,
    role: data?.title ?? "Untitled job",
    score: latest?.score ?? null,
    status: job.status,
    followUpAt: job.followUpAt,
    updatedAt:
      latest && latest.createdAt > job.updatedAt
        ? latest.createdAt
        : job.updatedAt,
  };
}

/** Score band for colouring: same thresholds as the report's verdict rules. */
export function scoreBand(
  score: number | null,
): "strong" | "maybe" | "weak" | "none" {
  if (score === null) return "none";
  if (score >= 70) return "strong";
  if (score >= 45) return "maybe";
  return "weak";
}

export function statusLabel(status: JobStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
