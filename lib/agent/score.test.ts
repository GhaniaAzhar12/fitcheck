import { describe, expect, test } from "bun:test";

import type { Evidence } from "./evidence";
import { fitScore } from "./score";

const e = (kind: Evidence["kind"], status: Evidence["status"]): Evidence => ({
  requirement: "x",
  kind,
  status,
  proof: null,
  source: { type: "none", ref: null },
});

describe("fitScore", () => {
  test("is 100 when everything is met and 0 when nothing is", () => {
    expect(fitScore([e("mustHave", "met"), e("niceToHave", "met")])).toBe(100);
    expect(fitScore([e("mustHave", "gap"), e("niceToHave", "gap")])).toBe(0);
  });

  test("gives half credit for partial", () => {
    expect(fitScore([e("mustHave", "partial")])).toBe(50);
  });

  test("weights must-haves double", () => {
    // must met (2/2) + nice gap (0/1) = 2/3
    expect(fitScore([e("mustHave", "met"), e("niceToHave", "gap")])).toBe(67);
    // must gap (0/2) + nice met (1/1) = 1/3
    expect(fitScore([e("mustHave", "gap"), e("niceToHave", "met")])).toBe(33);
  });

  test("is null with no requirements", () => {
    expect(fitScore([])).toBeNull();
  });
});
