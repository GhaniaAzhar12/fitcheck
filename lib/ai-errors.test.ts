import { describe, expect, test } from "bun:test";

import { APICallError, RetryError } from "ai";

import { aiErrorMessage, errorSummary } from "./ai-errors";

const apiError = (statusCode: number) =>
  new APICallError({
    message: "provider error",
    url: "https://example.test",
    requestBodyValues: {},
    statusCode,
  });

describe("aiErrorMessage", () => {
  test("explains a quota error even when wrapped in the SDK's RetryError", () => {
    const wrapped = new RetryError({
      message: "Failed after 3 attempts",
      reason: "maxRetriesExceeded",
      errors: [apiError(429), apiError(429)],
    });
    expect(aiErrorMessage(wrapped)).toBe(
      "The free AI quota is used up for now. Try again in a minute.",
    );
    expect(errorSummary(wrapped).status).toBe(429);
  });

  test("maps status codes to plain messages", () => {
    expect(aiErrorMessage(apiError(503))).toContain("busy");
    expect(aiErrorMessage(apiError(401))).toContain("key was rejected");
  });

  test("returns null for errors that aren't from the model", () => {
    expect(aiErrorMessage(new Error("db down"))).toBeNull();
  });
});
