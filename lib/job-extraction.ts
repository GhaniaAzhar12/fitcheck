import { z } from "zod";

// Shared by the server (extraction) and, later, the UI (types only).
// Missing values are `null` rather than omitted: models fill nullable
// fields more reliably than optional ones in structured output.

export const SENIORITY = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "unknown",
] as const;

export const WORK_MODE = ["remote", "hybrid", "onsite", "unknown"] as const;

export const JobExtraction = z.object({
  title: z.string().min(1).describe("Job title exactly as written in the post"),
  company: z
    .string()
    .nullable()
    .describe("Hiring company name, or null if not stated"),
  seniority: z
    .enum(SENIORITY)
    .describe(
      "Seniority level from the title and requirements; 'unknown' if unclear",
    ),
  remote: z
    .enum(WORK_MODE)
    .describe("Work arrangement; 'unknown' if not stated"),
  location: z
    .string()
    .nullable()
    .describe(
      "Where the person must be based, incl. remote limits, e.g. 'Remote (EU time zones)'; null if not stated",
    ),
  minYearsExperience: z
    .number()
    .int()
    .min(0)
    .max(30)
    .nullable()
    .describe("Minimum years of experience required, or null if not stated"),
  mustHave: z
    .array(z.string().min(1))
    .describe(
      "Requirements the post says are required. Short phrases, one skill or requirement each",
    ),
  niceToHave: z
    .array(z.string().min(1))
    .describe(
      "Requirements marked as bonus, preferred, plus or nice to have. Short phrases",
    ),
  stack: z
    .array(z.string().min(1))
    .describe(
      "Technologies named anywhere in the post (languages, frameworks, databases, cloud, tools), each once, in their usual spelling, e.g. 'Next.js', 'PostgreSQL'",
    ),
  salary: z
    .string()
    .nullable()
    .describe(
      "Salary or rate as written, incl. currency and period, e.g. '£70,000–£85,000 per year'; null if not stated",
    ),
});

export type JobExtraction = z.infer<typeof JobExtraction>;
