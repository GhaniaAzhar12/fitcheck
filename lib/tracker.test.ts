import { describe, expect, test } from "bun:test";

import { scoreBand, statusLabel, toTrackerRow } from "./tracker";

const extracted = {
  title: "Frontend Engineer",
  company: "Ritual",
  seniority: "mid",
  remote: "remote",
  location: null,
  minYearsExperience: null,
  mustHave: [],
  niceToHave: [],
  stack: [],
  salary: null,
};

const day = (d: number) =>
  new Date(`2026-11-${String(d).padStart(2, "0")}T10:00:00Z`);

describe("toTrackerRow", () => {
  test("uses the latest analysis score and the later of the two dates", () => {
    const row = toTrackerRow({
      id: "j1",
      extracted,
      status: "SAVED",
      followUpAt: null,
      updatedAt: day(18),
      analyses: [{ score: 74, createdAt: day(20) }],
    });
    expect(row).toEqual({
      id: "j1",
      company: "Ritual",
      role: "Frontend Engineer",
      score: 74,
      status: "SAVED",
      followUpAt: null,
      updatedAt: day(20),
    });
  });

  test("shows no score for a job that was never analysed", () => {
    const row = toTrackerRow({
      id: "j2",
      extracted,
      status: "APPLIED",
      followUpAt: day(25),
      updatedAt: day(21),
      analyses: [],
    });
    expect(row.score).toBeNull();
    expect(row.updatedAt).toEqual(day(21));
  });

  test("survives a job whose saved requirements can't be read", () => {
    const row = toTrackerRow({
      id: "j3",
      extracted: { broken: true },
      status: "SAVED",
      followUpAt: null,
      updatedAt: day(1),
      analyses: [],
    });
    expect(row.role).toBe("Untitled job");
    expect(row.company).toBeNull();
  });
});

describe("scoreBand / statusLabel", () => {
  test("bands match the verdict thresholds", () => {
    expect(scoreBand(70)).toBe("strong");
    expect(scoreBand(45)).toBe("maybe");
    expect(scoreBand(44)).toBe("weak");
    expect(scoreBand(null)).toBe("none");
  });

  test("labels statuses in sentence case", () => {
    expect(statusLabel("INTERVIEW")).toBe("Interview");
  });
});
