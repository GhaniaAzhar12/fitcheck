import { describe, expect, test } from "bun:test";

import {
  dateToFollowUp,
  filterRows,
  followUpToDate,
  isOverdue,
  scoreBand,
  sortRows,
  statusCounts,
  statusLabel,
  toTrackerRow,
} from "./tracker";

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

describe("interactive tracker helpers", () => {
  const row = (id: string, over: Partial<import("./tracker").ClientRow>) => ({
    id,
    company: null,
    role: id,
    score: null,
    status: "SAVED" as const,
    followUp: null,
    updatedAt: "2026-11-20T10:00:00.000Z",
    ...over,
  });
  const rows = [
    row("a", {
      score: 40,
      status: "APPLIED",
      followUp: "2026-11-25",
      updatedAt: "2026-11-21T09:00:00.000Z",
    }),
    row("b", { score: 80, followUp: "2026-11-19" }),
    row("c", { status: "APPLIED", updatedAt: "2026-11-22T09:00:00.000Z" }),
  ];

  test("follow-up days survive the round trip in any time zone", () => {
    const d = followUpToDate("2026-11-25");
    expect(d.toISOString()).toBe("2026-11-25T12:00:00.000Z");
    expect(dateToFollowUp(d)).toBe("2026-11-25");
    expect(dateToFollowUp(null)).toBeNull();
  });

  test("overdue means strictly before today", () => {
    expect(isOverdue("2026-11-20", "2026-11-21")).toBe(true);
    expect(isOverdue("2026-11-21", "2026-11-21")).toBe(false);
    expect(isOverdue(null, "2026-11-21")).toBe(false);
  });

  test("filters by status", () => {
    expect(filterRows(rows, "APPLIED").map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterRows(rows, "ALL")).toHaveLength(3);
  });

  test("sorts by score, follow-up and recency with blanks last", () => {
    expect(sortRows(rows, "score").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortRows(rows, "followUp").map((r) => r.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortRows(rows, "updated").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  test("counts jobs per status", () => {
    expect(statusCounts(rows)).toMatchObject({
      ALL: 3,
      SAVED: 1,
      APPLIED: 2,
      OFFER: 0,
    });
  });
});
