import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";

export const PROVIDERS = ["ollama", "google", "anthropic"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Used when AI_MODEL isn't set. */
export const DEFAULT_MODELS: Record<Provider, string> = {
  ollama: "qwen2.5:7b", // free, runs on your Mac
  google: "gemini-3.1-flash-lite", // free tier, stable
  anthropic: "claude-haiku-5-5", // paid, cheapest Claude
};

/**
 * Retries per model call (SDK default is 2). Free tiers limit requests per
 * minute; with exponential backoff (~2, 4, 8, 16 s) 4 retries give the
 * limit time to reset instead of failing the whole run.
 */
export const MODEL_RETRIES = 4;

export type ModelChoice = {
  provider: Provider;
  modelId: string;
  model: LanguageModel;
};

type Options = {
  /** Overrides AI_PROVIDER. */
  provider?: Provider;
  /** Overrides AI_MODEL. */
  modelId?: string;
  /** A visitor's own API key (bring your own key). Never stored. */
  apiKey?: string;
};

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

function providerFromEnv(): Provider {
  const value = (process.env.AI_PROVIDER ?? "ollama").trim().toLowerCase();
  if (!isProvider(value)) {
    throw new Error(
      `AI_PROVIDER must be one of ${PROVIDERS.join(", ")} (got "${value}")`,
    );
  }
  return value;
}

/**
 * Returns the language model to use, picked by AI_PROVIDER
 * (ollama | google | anthropic) and optionally AI_MODEL.
 */
export function getModel(options: Options = {}): ModelChoice {
  const provider = options.provider ?? providerFromEnv();
  const modelId =
    options.modelId || process.env.AI_MODEL?.trim() || DEFAULT_MODELS[provider];

  switch (provider) {
    case "ollama": {
      const ollama = createOllama({
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api",
      });
      return { provider, modelId, model: ollama(modelId) };
    }
    case "google": {
      // Falls back to GOOGLE_GENERATIVE_AI_API_KEY.
      const google = createGoogleGenerativeAI({ apiKey: options.apiKey });
      return { provider, modelId, model: google(modelId) };
    }
    case "anthropic": {
      // Falls back to ANTHROPIC_API_KEY.
      const anthropic = createAnthropic({ apiKey: options.apiKey });
      return { provider, modelId, model: anthropic(modelId) };
    }
  }
}
