import { describe, expect, test } from "bun:test";

import type { JobExtraction } from "@/lib/job-extraction";

import type { Expected } from "./cases";
import { normalizeTech, scoreCase, summarize } from "./score";

const expected: Expected = {
  title: "Full-Stack Developer",
  company: "Acme",
  seniority: ["mid"],
  remote: "remote",
  locationAnyOf: ["europe"],
  minYearsExperience: 3,
  salary: true,
  mustHave: [
    { id: "react", anyOf: ["react"] },
    { id: "postgres", anyOf: ["postgres*"] },
  ],
  niceToHave: [{ id: "docker", anyOf: ["docker"] }],
  stack: ["React", "PostgreSQL", "Docker"],
  mustNotInclude: ["take-home"],
  notes: "test",
};

const perfect: JobExtraction = {
  title: "Full-Stack Developer",
  company: "Acme",
  seniority: "mid",
  remote: "remote",
  location: "Remote (Europe)",
  minYearsExperience: 3,
  mustHave: ["Strong React", "PostgreSQL experience"],
  niceToHave: ["Docker"],
  stack: ["React", "Postgres", "Docker"],
  salary: "€3,000 per month",
};

describe("normalizeTech", () => {
  test("treats common spellings as the same technology", () => {
    expect(normalizeTech("Postgres")).toBe(normalizeTech("PostgreSQL"));
    expect(normalizeTech("Next.js")).toBe(normalizeTech("NextJS"));
    expect(normalizeTech("Node")).toBe(normalizeTech("Node.js"));
    expect(normalizeTech("Rails")).toBe(normalizeTech("Ruby on Rails"));
    expect(normalizeTech("GCP")).toBe(normalizeTech("Google Cloud"));
  });
});

describe("scoreCase", () => {
  test("a perfect extraction scores 100", () => {
    const s = scoreCase(perfect, expected);
    expect(s.score).toBe(100);
    expect(s.stackPrecision).toBe(1);
  });

  test("a missed must-have costs half of the 30-point recall weight", () => {
    const s = scoreCase({ ...perfect, mustHave: ["Strong React"] }, expected);
    expect(s.missedMust).toEqual(["postgres"]);
    expect(s.score).toBe(85);
  });

  test("spots a must-have filed as nice to have", () => {
    const s = scoreCase(
      {
        ...perfect,
        mustHave: ["Strong React"],
        niceToHave: ["Docker", "Postgres"],
      },
      expected,
    );
    expect(s.misplaced).toEqual(["postgres"]);
  });

  test("a trap counted as a requirement loses the trap points", () => {
    const s = scoreCase(
      {
        ...perfect,
        mustHave: [...perfect.mustHave, "Complete take home task"],
      },
      expected,
    );
    expect(s.trapsHit).toEqual(["take-home"]);
    expect(s.metrics.traps).toBe(0);
  });

  test("reports invented technologies and wrong facts", () => {
    const s = scoreCase(
      {
        ...perfect,
        stack: ["React", "Postgres", "Docker", "Kubernetes"],
        seniority: "senior",
        location: null,
        salary: null,
      },
      expected,
    );
    expect(s.extraStack).toEqual(["Kubernetes"]);
    expect(s.stackPrecision).toBe(0.75);
    expect(s.metrics).toMatchObject({ seniority: 0, location: 0, salary: 0 });
  });
});

describe("summarize", () => {
  test("averages cases and counts failures as zero", () => {
    const good = scoreCase(perfect, expected);
    const summary = summarize([good, null]);
    expect(summary.overall).toBe(50);
    expect(summary.failed).toBe(1);
    expect(summary.metrics.mustRecall).toBe(50);
  });
});
