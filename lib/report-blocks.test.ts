import { describe, expect, test } from "bun:test";

import { parseReport, verdictFrom } from "./report-blocks";

const REPORT = `## Verdict: Apply with a plan
Your score is 62/100: a solid React match with two gaps.

## Your strongest points
- **3+ years** of React (CV · EXPERIENCE)
* Tailwind used in fitcheck/app/globals.css

## Pitch
I build accessible React apps and ship them.`;

describe("parseReport", () => {
  test("reads the verdict, headings, bullets and paragraphs", () => {
    expect(parseReport(REPORT)).toEqual([
      { type: "verdict", label: "Apply with a plan", verdict: "plan" },
      {
        type: "paragraph",
        text: "Your score is 62/100: a solid React match with two gaps.",
      },
      { type: "heading", text: "Your strongest points" },
      { type: "bullet", text: "3+ years of React (CV · EXPERIENCE)" },
      { type: "bullet", text: "Tailwind used in fitcheck/app/globals.css" },
      { type: "heading", text: "Pitch" },
      {
        type: "paragraph",
        text: "I build accessible React apps and ship them.",
      },
    ]);
  });

  test("handles half-streamed text without crashing", () => {
    expect(parseReport("## Verdict: Sk")).toEqual([
      { type: "verdict", label: "Sk", verdict: null },
    ]);
    expect(parseReport("## Your strongest points\n- **3+ ye")).toEqual([
      { type: "heading", text: "Your strongest points" },
      { type: "bullet", text: "3+ ye" },
    ]);
  });

  test("keeps markup as plain text (nothing is rendered as HTML)", () => {
    expect(parseReport("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("verdictFrom", () => {
  test("maps the three verdicts", () => {
    expect(verdictFrom("Apply")).toBe("apply");
    expect(verdictFrom("Apply with a plan")).toBe("plan");
    expect(verdictFrom("Skip")).toBe("skip");
    expect(verdictFrom("Maybe")).toBeNull();
  });
});
