import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

import type { AiChoice } from "@/lib/ai-choice";

/** The embedding model id, as sent to Google. */
export const EMBED_MODEL_ID = "gemini-embedding-001";
/** Stored on each cv_chunk row: which model made its vector. */
export const EMBED_MODEL_LABEL = `google:${EMBED_MODEL_ID}`;
export const EMBED_DIMENSIONS = 768;

/**
 * Embedding is an extra, never required: one retry and a short timeout, so a
 * failing API falls back to keyword search fast instead of eating the
 * analysis's time budget.
 */
const EMBED_RETRIES = 1;
const DOCUMENTS_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 5_000;

type Env = Record<string, string | undefined>;

/** Google returns no token count for embeddings; record 0 rather than NaN. */
const tokensOf = (usage: { tokens?: number } | undefined) =>
  Number.isFinite(usage?.tokens) ? (usage?.tokens as number) : 0;

/**
 * Meaning-based search only runs on the app's own Gemini key (the free
 * tier), whose users already send their CV to Google. Own-key and Local
 * runs keep keyword search, so their CV is never embedded.
 */
export function meaningSearchAllowed(
  aiChoice: AiChoice,
  env: Env = process.env,
): boolean {
  if (aiChoice) return false;
  const provider = (env.AI_PROVIDER ?? "ollama").trim().toLowerCase();
  return (
    provider === "google" && Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY?.trim())
  );
}

function model() {
  // The app's key, from GOOGLE_GENERATIVE_AI_API_KEY.
  return createGoogleGenerativeAI().embeddingModel(EMBED_MODEL_ID);
}

/** Embeds CV chunks in one call. */
export async function embedDocuments(
  texts: string[],
): Promise<{ vectors: number[][]; tokens: number; ms: number }> {
  const started = Date.now();
  const { embeddings, usage } = await embedMany({
    model: model(),
    values: texts,
    dimensions: EMBED_DIMENSIONS,
    maxRetries: EMBED_RETRIES,
    abortSignal: AbortSignal.timeout(DOCUMENTS_TIMEOUT_MS),
    providerOptions: { google: { taskType: "RETRIEVAL_DOCUMENT" } },
  });
  return {
    vectors: embeddings,
    tokens: tokensOf(usage),
    ms: Date.now() - started,
  };
}

/** Embeds one search query. */
export async function embedQuery(
  text: string,
): Promise<{ vector: number[]; tokens: number }> {
  const { embedding, usage } = await embed({
    model: model(),
    value: text,
    dimensions: EMBED_DIMENSIONS,
    maxRetries: EMBED_RETRIES,
    abortSignal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    providerOptions: { google: { taskType: "RETRIEVAL_QUERY" } },
  });
  return { vector: embedding, tokens: tokensOf(usage) };
}
