import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { SENIORITY, WORK_MODE } from "@/lib/job-extraction";

// Hand-labelled job posts for scoring the extraction (evals/jobs/*).
// Each case is a folder with post.txt and expected.json.

/** A requirement concept and the words that count as finding it. */
const Concept = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Lower-case substrings; an extracted item matching any of them counts. */
  anyOf: z.array(z.string().min(2)).min(1),
});

export const Expected = z.object({
  title: z.string().min(1),
  company: z.string().nullable(),
  /** Acceptable answers: more than one where it's honestly ambiguous. */
  seniority: z.array(z.enum(SENIORITY)).min(1),
  remote: z.enum(WORK_MODE),
  /** The location must contain one of these (lower-case), or null if not stated. */
  locationAnyOf: z.array(z.string().min(2)).nullable(),
  minYearsExperience: z.number().int().nullable(),
  /** Whether a salary or rate is stated. */
  salary: z.boolean(),
  mustHave: z.array(Concept).min(1),
  niceToHave: z.array(Concept),
  /** Technologies named in the post, in their usual spelling. */
  stack: z.array(z.string().min(1)),
  /** Things in the post that must NOT come out as requirements. */
  mustNotInclude: z.array(z.string().min(2)),
  /** What makes this case tricky, for humans. */
  notes: z.string().min(1),
});
export type Expected = z.infer<typeof Expected>;

export type EvalCase = { id: string; post: string; expected: Expected };

export const EVALS_DIR = join(process.cwd(), "evals", "jobs");

export async function loadCases(dir = EVALS_DIR): Promise<EvalCase[]> {
  const ids = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return Promise.all(
    ids.map(async (id) => ({
      id,
      post: await readFile(join(dir, id, "post.txt"), "utf8"),
      expected: Expected.parse(
        JSON.parse(await readFile(join(dir, id, "expected.json"), "utf8")),
      ),
    })),
  );
}
