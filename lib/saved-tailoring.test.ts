import { describe, expect, test } from "bun:test";

import { readInterview, readTailored } from "./saved-tailoring";

const meta = {
  provider: "google",
  modelId: "gemini-3.1-flash-lite",
  ms: 3800,
  generatedAt: "2026-11-21T15:30:00.000Z",
};

describe("readTailored", () => {
  test("reads a saved result", () => {
    const saved = {
      cvBullets: [{ text: "Led a 6-person team", unverified: [] }],
      coverNote: { text: "Hello", unverified: ["40%"] },
      ...meta,
    };
    expect(readTailored(saved)).toEqual(saved);
  });

  test("returns null for missing or malformed data instead of throwing", () => {
    expect(readTailored(null)).toBeNull();
    expect(readTailored({ cvBullets: "oops" })).toBeNull();
    // An older shape without generatedAt
    expect(
      readTailored({
        cvBullets: [],
        coverNote: { text: "", unverified: [] },
        provider: "x",
        modelId: "y",
        ms: 1,
      }),
    ).toBeNull();
  });
});

describe("readInterview", () => {
  test("reads saved questions and rejects bad types", () => {
    const q = {
      question: "Why React?",
      type: "technical",
      whyAsked: "core skill",
      answer: "Because…",
      sourceProject: null,
      unverified: [],
    };
    expect(readInterview({ questions: [q], ...meta })?.questions).toHaveLength(
      1,
    );
    expect(
      readInterview({ questions: [{ ...q, type: "trivia" }], ...meta }),
    ).toBeNull();
  });
});
