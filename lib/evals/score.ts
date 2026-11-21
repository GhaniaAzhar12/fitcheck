import type { JobExtraction } from "@/lib/job-extraction";

import type { Expected } from "./cases";
import { matchesAny } from "./match";

// Scores one extraction against its hand-written label. Pure functions:
// the eval script calls the model, these only compare.

export const WEIGHTS = {
  mustRecall: 30,
  stackRecall: 15,
  niceRecall: 10,
  location: 10,
  seniority: 10,
  traps: 10,
  remote: 5,
  years: 5,
  salary: 5,
} as const;

export type Metric = keyof typeof WEIGHTS;

export type CaseScore = {
  /** 0–100, weighted. */
  score: number;
  metrics: Record<Metric, number>; // each 0–1
  missedMust: string[];
  missedNice: string[];
  /** Concepts found, but in the other list. */
  misplaced: string[];
  missedStack: string[];
  /** Technologies the model listed that aren't in the label. */
  extraStack: string[];
  /** 0–1: share of extracted stack items that are in the label. */
  stackPrecision: number;
  /** Trap phrases that came out as requirements. */
  trapsHit: string[];
};

/** Spellings that mean the same technology. Keys and values are normalised. */
const TECH_ALIASES: Record<string, string> = {
  postgres: "postgresql",
  node: "nodejs",
  next: "nextjs",
  reactjs: "react",
  tailwind: "tailwindcss",
  gcp: "googlecloud",
  googlecloudplatform: "googlecloud",
  rails: "rubyonrails",
  ror: "rubyonrails",
  drf: "djangorestframework",
  rtl: "reacttestinglibrary",
  aisdk: "vercelaisdk",
  golang: "go",
  k8s: "kubernetes",
  js: "javascript",
  ts: "typescript",
  mongo: "mongodb",
  amazonwebservices: "aws",
  awslambda: "lambda",
  amazonsqs: "sqs",
  restapi: "rest",
  restapis: "rest",
  restful: "rest",
};

export function normalizeTech(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return TECH_ALIASES[key] ?? key;
}

/** Hyphens, spaces and case don't matter when spotting a trap phrase. */
function squash(s: string) {
  return s
    .toLowerCase()
    .replace(/[-\s]+/g, " ")
    .trim();
}

function recall(
  concepts: Expected["mustHave"],
  items: string[],
): { found: string[]; missed: string[] } {
  const found: string[] = [];
  const missed: string[] = [];
  for (const c of concepts) {
    (items.some((item) => matchesAny(item, c.anyOf)) ? found : missed).push(
      c.id,
    );
  }
  return { found, missed };
}

const ratio = (part: number, whole: number) => (whole ? part / whole : 1);

export function scoreCase(
  actual: JobExtraction,
  expected: Expected,
): CaseScore {
  const must = recall(expected.mustHave, actual.mustHave);
  const nice = recall(expected.niceToHave, actual.niceToHave);

  // Found in the wrong list: e.g. a must-have filed as nice to have.
  const misplaced = [
    ...must.missed.filter((id) => {
      const c = expected.mustHave.find((x) => x.id === id);
      return c && actual.niceToHave.some((item) => matchesAny(item, c.anyOf));
    }),
    ...nice.missed.filter((id) => {
      const c = expected.niceToHave.find((x) => x.id === id);
      return c && actual.mustHave.some((item) => matchesAny(item, c.anyOf));
    }),
  ];

  const wantStack = new Map(expected.stack.map((t) => [normalizeTech(t), t]));
  const gotStack = new Set(actual.stack.map(normalizeTech));
  const missedStack = [...wantStack]
    .filter(([n]) => !gotStack.has(n))
    .map(([, t]) => t);
  const extraStack = actual.stack.filter(
    (t) => !wantStack.has(normalizeTech(t)),
  );

  const requirementText = [...actual.mustHave, ...actual.niceToHave].map(
    squash,
  );
  const trapsHit = expected.mustNotInclude.filter((trap) =>
    requirementText.some((r) => r.includes(squash(trap))),
  );

  const location = actual.location?.toLowerCase() ?? null;
  const locationOk =
    expected.locationAnyOf === null
      ? true
      : location !== null &&
        expected.locationAnyOf.some((w) => location.includes(w));

  const metrics: Record<Metric, number> = {
    mustRecall: ratio(must.found.length, expected.mustHave.length),
    niceRecall: ratio(nice.found.length, expected.niceToHave.length),
    stackRecall: ratio(wantStack.size - missedStack.length, wantStack.size),
    seniority: expected.seniority.includes(actual.seniority) ? 1 : 0,
    remote: actual.remote === expected.remote ? 1 : 0,
    location: locationOk ? 1 : 0,
    years: actual.minYearsExperience === expected.minYearsExperience ? 1 : 0,
    salary: (actual.salary !== null) === expected.salary ? 1 : 0,
    traps: trapsHit.length ? 0 : 1,
  };

  const score = (Object.keys(WEIGHTS) as Metric[]).reduce(
    (sum, m) => sum + WEIGHTS[m] * metrics[m],
    0,
  );

  return {
    score: Math.round(score * 10) / 10,
    metrics,
    missedMust: must.missed,
    missedNice: nice.missed,
    misplaced,
    missedStack,
    extraStack,
    stackPrecision: ratio(
      actual.stack.length - extraStack.length,
      actual.stack.length,
    ),
    trapsHit,
  };
}

/** Averages across cases; failed cases count as 0. */
export function summarize(scores: (CaseScore | null)[]) {
  const ok = scores.filter((s): s is CaseScore => s !== null);
  const n = scores.length || 1;
  const avg = (f: (s: CaseScore) => number) =>
    Math.round((ok.reduce((sum, s) => sum + f(s), 0) / n) * 1000) / 10;
  const metrics = Object.fromEntries(
    (Object.keys(WEIGHTS) as Metric[]).map((m) => [
      m,
      avg((s) => s.metrics[m]),
    ]),
  ) as Record<Metric, number>;
  return {
    overall:
      Math.round((ok.reduce((sum, s) => sum + s.score, 0) / n) * 10) / 10,
    metrics, // percentages
    stackPrecision: avg((s) => s.stackPrecision),
    failed: scores.length - ok.length,
  };
}
