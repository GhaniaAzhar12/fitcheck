import { describe, expect, test } from "bun:test";

import { byDay, byKind, totals } from "./usage-summary";

const event = (over: Partial<Parameters<typeof totals>[0][number]>) => ({
  kind: "ANALYSIS",
  provider: "google",
  model: "gemini-3.1-flash-lite",
  ownKey: false,
  ok: true,
  inputTokens: 1000,
  outputTokens: 100,
  ms: 2000,
  createdAt: new Date("2026-11-21T10:00:00Z"),
  ...over,
});

describe("totals", () => {
  test("adds tokens, time and failures; free calls cost nothing", () => {
    expect(totals([event({}), event({ ok: false, inputTokens: 500 })])).toEqual(
      {
        calls: 2,
        failed: 1,
        inputTokens: 1500,
        outputTokens: 200,
        ms: 4000,
        cost: 0,
      },
    );
  });

  test("prices own Claude keys", () => {
    const t = totals([
      event({
        provider: "anthropic",
        model: "claude-haiku-5-5",
        ownKey: true,
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ]);
    expect(t.cost).toBeCloseTo(0.1, 6);
  });
});

describe("byDay / byKind", () => {
  const events = [
    event({
      createdAt: new Date("2026-11-20T23:30:00Z"),
      kind: "EXTRACT",
      inputTokens: 300,
    }),
    event({ createdAt: new Date("2026-11-21T08:00:00Z") }),
    event({
      createdAt: new Date("2026-11-21T18:00:00Z"),
      kind: "REPORT",
      inputTokens: 2000,
    }),
  ];

  test("groups by UTC day, newest first", () => {
    expect(byDay(events).map((d) => [d.day, d.calls])).toEqual([
      ["2026-11-21", 2],
      ["2026-11-20", 1],
    ]);
  });

  test("groups by kind, most tokens first", () => {
    expect(byKind(events).map((k) => k.kind)).toEqual([
      "REPORT",
      "ANALYSIS",
      "EXTRACT",
    ]);
  });
});
