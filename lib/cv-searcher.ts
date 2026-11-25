import "server-only";

import {
  type CvSearcher,
  createHybridSearcher,
  keywordSearcher,
  MEANING_FLOOR,
} from "@/lib/agent/hybrid-search";
import type { AiChoice } from "@/lib/ai-choice";
import { ensureEmbeddings, loadCvChunks, vectorSearch } from "@/lib/cv-chunks";
import {
  EMBED_MODEL_ID,
  embedQuery,
  meaningSearchAllowed,
} from "@/lib/cv-embeddings";
import { recordUsage } from "@/lib/usage";

/**
 * The CV search for one analysis: keyword + meaning on the app's Gemini key,
 * keyword only otherwise (own key, Local, or if embedding fails).
 * Call finish() after the run to log the query embeddings. Never throws.
 */
export async function cvSearcherFor({
  userId,
  cvText,
  jobId,
  aiChoice,
}: {
  userId: string;
  cvText: string;
  jobId: string;
  aiChoice: AiChoice;
}): Promise<{ search: CvSearcher; finish: () => Promise<void> }> {
  const keywordOnly = {
    search: keywordSearcher(cvText),
    finish: async () => {},
  };
  if (!meaningSearchAllowed(aiChoice)) return keywordOnly;
  if (!(await ensureEmbeddings({ userId, cvText, jobId }))) return keywordOnly;

  let chunks: Awaited<ReturnType<typeof loadCvChunks>>;
  try {
    chunks = await loadCvChunks(userId);
  } catch (error) {
    console.error(
      `[analysis ${jobId}] couldn't load CV chunks, using keywords`,
      error instanceof Error ? error.message : error,
    );
    return keywordOnly;
  }

  let tokens = 0;
  let ms = 0;
  let errorLogged = false;
  const search = createHybridSearcher({
    chunks,
    embedQuery: async (query) => {
      const started = Date.now();
      const result = await embedQuery(query);
      ms += Date.now() - started;
      tokens += result.tokens;
      return result.vector;
    },
    vectorSearch: (vector) => vectorSearch(userId, vector),
    minSimilarity: MEANING_FLOOR,
    onError: (error) => {
      if (errorLogged) return; // one line per run, not per search
      errorLogged = true;
      console.error(
        `[analysis ${jobId}] meaning search failed, using keywords`,
        error instanceof Error ? error.message : error,
      );
    },
  });

  return {
    search,
    finish: async () => {
      if (!search.queries()) return;
      await recordUsage({
        userId,
        jobId,
        kind: "EMBED",
        provider: "google",
        model: EMBED_MODEL_ID,
        inputTokens: tokens,
        ms,
      });
    },
  };
}
