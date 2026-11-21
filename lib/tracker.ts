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

// ─── Interactive tracker (Day 19) ────────────────────────────────────────────

/** A tracker row as sent to the browser: dates as plain strings. */
export type ClientRow = Omit<TrackerRow, "followUpAt" | "updatedAt"> & {
  /** "YYYY-MM-DD" or null. A day, not a moment, so time zones can't shift it. */
  followUp: string | null;
  updatedAt: string; // ISO timestamp
};

export type StatusFilter = JobStatus | "ALL";
export type SortKey = "updated" | "score" | "followUp";

/** Saved as noon UTC so the calendar day is the same in every time zone. */
export function followUpToDate(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

export function dateToFollowUp(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function toClientRow(row: TrackerRow): ClientRow {
  const { followUpAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    followUp: dateToFollowUp(followUpAt),
    updatedAt: updatedAt.toISOString(),
  };
}

/** today is the viewer's local date as "YYYY-MM-DD". */
export function isOverdue(followUp: string | null, today: string): boolean {
  return followUp !== null && followUp < today;
}

export function filterRows(
  rows: ClientRow[],
  status: StatusFilter,
): ClientRow[] {
  return status === "ALL" ? rows : rows.filter((r) => r.status === status);
}

export function sortRows(rows: ClientRow[], key: SortKey): ClientRow[] {
  const copy = [...rows];
  if (key === "score") {
    // Highest first; never-analysed jobs last.
    return copy.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }
  if (key === "followUp") {
    // Soonest first; jobs without a date last.
    return copy.sort((a, b) =>
      (a.followUp ?? "9999-12-31").localeCompare(b.followUp ?? "9999-12-31"),
    );
  }
  return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function statusCounts(rows: ClientRow[]): Record<StatusFilter, number> {
  const counts = { ALL: rows.length } as Record<StatusFilter, number>;
  for (const s of JOB_STATUSES) counts[s] = 0;
  for (const r of rows) counts[r.status]++;
  return counts;
}
