import { describe, expect, test } from "bun:test";

import { normalizeJobUrl } from "./job-url";

describe("normalizeJobUrl", () => {
  test("treats tracking parameters, www, trailing slashes and #fragments as the same link", () => {
    const base = normalizeJobUrl(
      "https://weworkremotely.com/remote-jobs/ritual-frontend-engineer",
    );
    for (const variant of [
      "https://weworkremotely.com/remote-jobs/ritual-frontend-engineer/",
      "https://www.weworkremotely.com/remote-jobs/ritual-frontend-engineer",
      "https://weworkremotely.com/remote-jobs/ritual-frontend-engineer?utm_source=linkedin&utm_medium=social",
      "https://weworkremotely.com/remote-jobs/ritual-frontend-engineer#apply",
      "  https://WeWorkRemotely.com/remote-jobs/ritual-frontend-engineer?ref=feed  ",
    ]) {
      expect(normalizeJobUrl(variant)).toBe(base);
    }
  });

  test("keeps parameters that identify the job", () => {
    expect(
      normalizeJobUrl(
        "https://boards.example.com/jobs?gh_jid=123&utm_source=x",
      ),
    ).toBe("https://boards.example.com/jobs?gh_jid=123");
    expect(
      normalizeJobUrl("https://boards.example.com/jobs?gh_jid=123"),
    ).not.toBe(normalizeJobUrl("https://boards.example.com/jobs?gh_jid=456"));
  });

  test("returns null for something that isn't a link", () => {
    expect(normalizeJobUrl("not a link")).toBeNull();
  });
});
