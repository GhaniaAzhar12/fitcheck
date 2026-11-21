import { describe, expect, test } from "bun:test";

import { unreadableSourceMessage } from "./job-sources";

describe("unreadableSourceMessage", () => {
  test("explains Google Jobs share and search links", () => {
    for (const url of [
      "https://share.google/87TgOr2ip1bto1Tpq",
      "https://www.google.com/search?q=jobs+for+software+engineer&ibp=htl;jobs",
      "https://www.google.com.pk/search?q=react+jobs",
    ]) {
      expect(unreadableSourceMessage(url)).toContain("Google Jobs");
    }
  });

  test("explains LinkedIn links", () => {
    expect(
      unreadableSourceMessage("https://www.linkedin.com/jobs/view/123"),
    ).toContain("LinkedIn");
    expect(
      unreadableSourceMessage("https://pk.linkedin.com/jobs/view/123"),
    ).toContain("LinkedIn");
    expect(unreadableSourceMessage("https://lnkd.in/abc")).toContain(
      "LinkedIn",
    );
  });

  test("lets normal job pages through", () => {
    for (const url of [
      "https://weworkremotely.com/remote-jobs/ritual-frontend-engineer",
      "https://job-boards.greenhouse.io/vercel/jobs/6231864004",
      "https://careers.google.com/jobs/results/123", // Google's own careers site is readable
      "https://notlinkedin.com/jobs/1",
      "not a link",
    ]) {
      expect(unreadableSourceMessage(url)).toBeNull();
    }
  });
});
