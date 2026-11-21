import { describe, expect, test } from "bun:test";

import {
  jobFor,
  judge,
  loadEvidenceCases,
  summarizeEvidence,
} from "./evidence";

describe("judge", () => {
  test("accepts any acceptable status", () => {
    expect(judge("partial", ["met", "partial"])).toBe("correct");
    expect(judge("gap", ["gap"])).toBe("correct");
  });

  test("calls a too-generous status an overclaim", () => {
    expect(judge("met", ["gap"])).toBe("overclaim");
    expect(judge("met", ["gap", "partial"])).toBe("overclaim");
    expect(judge("partial", ["gap"])).toBe("overclaim");
  });

  test("calls a too-strict status an underclaim", () => {
    expect(judge("gap", ["met"])).toBe("underclaim");
    expect(judge("partial", ["met"])).toBe("underclaim");
  });
});

describe("summarizeEvidence", () => {
  test("reports accuracy and error types", () => {
    expect(
      summarizeEvidence(["correct", "correct", "overclaim", "underclaim"]),
    ).toEqual({
      accuracy: 50,
      correct: 2,
      overclaims: 1,
      underclaims: 1,
      total: 4,
    });
  });
});

describe("evidence cases", async () => {
  const cases = await loadEvidenceCases();

  test("there are 5 cases, each linked to an eval job", () => {
    expect(cases).toHaveLength(5);
    for (const c of cases) expect(c.expected.title.length).toBeGreaterThan(0);
  });

  test("the agent's job keeps requirements in order, must-haves first", () => {
    for (const c of cases) {
      const job = jobFor(c, c.expected);
      expect([...job.mustHave, ...job.niceToHave]).toEqual([
        ...c.requirements
          .filter((r) => r.kind === "mustHave")
          .map((r) => r.text),
        ...c.requirements
          .filter((r) => r.kind === "niceToHave")
          .map((r) => r.text),
      ]);
    }
  });
});
