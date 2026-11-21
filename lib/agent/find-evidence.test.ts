import { describe, expect, test } from "bun:test";

import type { JobExtraction } from "@/lib/job-extraction";

import {
  finalizeEvidence,
  githubCallsAtLeast,
  requirementsList,
} from "./find-evidence";

const job: JobExtraction = {
  title: "Frontend Developer",
  company: "Acme",
  seniority: "mid",
  remote: "remote",
  location: null,
  minYearsExperience: 3,
  mustHave: ["React", "TypeScript"],
  niceToHave: ["Stripe"],
  stack: ["React", "TypeScript", "Stripe"],
  salary: null,
};

const reqs = requirementsList(job);
const seen = {
  repos: ["jane/shop"],
  files: new Set(["jane/shop:app/checkout.ts", "jane/shop:README.md"]),
  cvSections: new Set(["EXPERIENCE", "SKILLS"]),
};

describe("requirementsList", () => {
  test("numbers must-haves first, then nice-to-haves", () => {
    expect(reqs).toEqual([
      { id: "R1", text: "React", kind: "mustHave" },
      { id: "R2", text: "TypeScript", kind: "mustHave" },
      { id: "R3", text: "Stripe", kind: "niceToHave" },
    ]);
  });
});

describe("finalizeEvidence", () => {
  test("keeps well-sourced claims as they are", () => {
    const [react, , stripe] = finalizeEvidence(
      reqs,
      [
        {
          id: "R1",
          status: "met",
          proof: "Built React apps",
          sourceType: "cv",
          sourceRef: "EXPERIENCE",
        },
        {
          id: "R3",
          status: "met",
          proof: "Stripe checkout code",
          sourceType: "repo",
          sourceRef: "jane/shop:app/checkout.ts:12",
        },
      ],
      seen,
    );
    expect(react).toMatchObject({
      status: "met",
      source: { type: "cv", ref: "EXPERIENCE" },
    });
    expect(stripe).toMatchObject({
      status: "met",
      source: { type: "repo", ref: "jane/shop:app/checkout.ts:12" },
    });
  });

  test("turns requirements the judge skipped into gaps", () => {
    const [, ts] = finalizeEvidence(reqs, [], seen);
    expect(ts).toEqual({
      requirement: "TypeScript",
      kind: "mustHave",
      status: "gap",
      proof: null,
      source: { type: "none", ref: null },
    });
  });

  test("downgrades a 'met' that cites a file the tools never saw", () => {
    const [, , stripe] = finalizeEvidence(
      reqs,
      [
        {
          id: "R3",
          status: "met",
          proof: "Stripe code",
          sourceType: "repo",
          sourceRef: "jane/shop:lib/stripe.ts",
        },
      ],
      seen,
    );
    expect(stripe).toMatchObject({
      status: "partial",
      source: { type: "repo", ref: "jane/shop" },
    });
  });

  test("drops citations to repos that aren't the user's", () => {
    const [react] = finalizeEvidence(
      reqs,
      [
        {
          id: "R1",
          status: "met",
          proof: "x",
          sourceType: "repo",
          sourceRef: "facebook/react:index.js",
        },
      ],
      seen,
    );
    expect(react).toMatchObject({
      status: "partial",
      source: { type: "repo", ref: null },
    });
  });

  test("clears unknown CV sections and proof on gaps", () => {
    const [react, ts] = finalizeEvidence(
      reqs,
      [
        {
          id: "r1",
          status: "partial",
          proof: "Listed",
          sourceType: "cv",
          sourceRef: "HOBBIES",
        },
        {
          id: "R2",
          status: "gap",
          proof: "nothing",
          sourceType: "cv",
          sourceRef: "SKILLS",
        },
      ],
      seen,
    );
    expect(react?.source).toEqual({ type: "cv", ref: null });
    expect(ts).toMatchObject({
      status: "gap",
      proof: null,
      source: { type: "none", ref: null },
    });
  });
});

describe("githubCallsAtLeast", () => {
  const step = (...names: string[]) => ({
    toolCalls: names.map((toolName) => ({ toolName })),
  });
  // Only the fields the condition reads.
  const check = (max: number, steps: ReturnType<typeof step>[]) =>
    githubCallsAtLeast(max)({ steps } as never);

  test("ignores free CV searches", () => {
    expect(check(2, [step("search_cv", "search_cv", "search_cv")])).toBe(false);
  });

  test("stops once enough GitHub calls are made across steps", () => {
    expect(
      check(2, [step("list_repo_files", "search_cv"), step("read_file")]),
    ).toBe(true);
  });
});
