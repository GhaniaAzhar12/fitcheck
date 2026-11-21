import { describe, expect, test } from "bun:test";

import { costUsd, formatUsd, sumUsd } from "./pricing";

const call = { inputTokens: 20_000, outputTokens: 2_000, ownKey: true };

describe("costUsd", () => {
  test("local models and the app's free Gemini tier cost nothing", () => {
    expect(costUsd({ ...call, provider: "ollama", model: "qwen2.5:7b" })).toBe(
      0,
    );
    expect(
      costUsd({
        ...call,
        provider: "google",
        model: "gemini-3.1-flash-lite",
        ownKey: false,
      }),
    ).toBe(0);
  });

  test("own Claude keys are priced per million tokens", () => {
    // Haiku 5.5: 20k at 0.10/M + 2k at 0.50/M = 0.002 + 0.001 dollars
    expect(
      costUsd({ ...call, provider: "anthropic", model: "claude-haiku-5-5" }),
    ).toBeCloseTo(0.003, 6);
    // Sonnet 5.5: 20k at 2/M + 2k at 10/M = 0.04 + 0.02 dollars
    expect(
      costUsd({ ...call, provider: "anthropic", model: "claude-sonnet-5-5" }),
    ).toBeCloseTo(0.06, 6);
  });

  test("unknown prices are null, not guessed", () => {
    expect(
      costUsd({ ...call, provider: "google", model: "gemini-3.1-flash-lite" }),
    ).toBeNull();
    expect(
      costUsd({ ...call, provider: "anthropic", model: "claude-unknown" }),
    ).toBeNull();
  });
});

describe("formatUsd / sumUsd", () => {
  test("formats small, normal and unknown amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.003)).toBe("$0.0030");
    expect(formatUsd(1.254)).toBe("$1.25");
    expect(formatUsd(null)).toBe("price not set");
  });

  test("sums known costs; unknown only when nothing is known", () => {
    expect(sumUsd([0.01, 0.02])).toBeCloseTo(0.03, 6);
    expect(sumUsd([0.01, null])).toBeCloseTo(0.01, 6);
    expect(sumUsd([null, null])).toBeNull();
    expect(sumUsd([])).toBe(0);
  });
});
