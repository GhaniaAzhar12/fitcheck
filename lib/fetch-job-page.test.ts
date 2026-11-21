import { describe, expect, test } from "bun:test";

import { httpErrorMessage } from "./fetch-job-page";

const headers = (server = "") => new Headers(server ? { server } : {});

describe("httpErrorMessage", () => {
  test("asks for the text when a site blocks automated readers", () => {
    for (const status of [401, 403, 429]) {
      expect(httpErrorMessage(status, headers())).toContain(
        "blocks automated readers",
      );
    }
    // Cloudflare's challenge page (e.g. JobLeads)
    expect(httpErrorMessage(503, headers("cloudflare"))).toContain(
      "blocks automated readers",
    );
  });

  test("says when a job has been taken down", () => {
    expect(httpErrorMessage(404, headers())).toContain(
      "doesn't exist any more",
    );
  });

  test("falls back to the status code for other errors", () => {
    expect(httpErrorMessage(500, headers())).toContain("(500)");
    expect(httpErrorMessage(503, headers("nginx"))).toContain("(503)");
  });
});
