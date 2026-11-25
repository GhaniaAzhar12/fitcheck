import { describe, expect, test } from "bun:test";

import { meaningSearchAllowed } from "./cv-embeddings";

const KEY = "x".repeat(39);
const appGoogle = { AI_PROVIDER: "google", GOOGLE_GENERATIVE_AI_API_KEY: KEY };

describe("meaningSearchAllowed", () => {
  test("the app's own Gemini key: yes", () => {
    expect(meaningSearchAllowed(undefined, appGoogle)).toBe(true);
  });

  test("the app runs on Ollama: no", () => {
    expect(meaningSearchAllowed(undefined, { AI_PROVIDER: "ollama" })).toBe(
      false,
    );
  });

  test("no Google key on the server: no", () => {
    expect(
      meaningSearchAllowed(undefined, {
        AI_PROVIDER: "google",
        GOOGLE_GENERATIVE_AI_API_KEY: " ",
      }),
    ).toBe(false);
  });

  test("the visitor's own Anthropic key: no", () => {
    expect(
      meaningSearchAllowed({ provider: "anthropic", apiKey: KEY }, appGoogle),
    ).toBe(false);
  });

  test("the visitor's own Google key: no", () => {
    expect(
      meaningSearchAllowed({ provider: "google", apiKey: KEY }, appGoogle),
    ).toBe(false);
  });

  test("Local mode: no", () => {
    expect(meaningSearchAllowed({ provider: "ollama" }, appGoogle)).toBe(false);
  });
});
