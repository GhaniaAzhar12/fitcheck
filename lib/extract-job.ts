import "server-only";

import { generateText, Output } from "ai";

import { JobExtraction } from "@/lib/job-extraction";
import { getModel } from "@/lib/model";

/** Long posts are cut here; requirements are almost always in the first part. */
const MAX_CHARS = 20_000;
/** Free-tier models can be slow and the SDK retries on 503s. */
const TIMEOUT_MS = 90_000;

const INSTRUCTIONS = `You extract structured requirements from job posts.

Rules:
- Use only what the post says. Never guess or add requirements that are not written.
- mustHave: things the post requires ("required", "must", "you have", "we need", listed requirements).
- niceToHave: things marked as bonus, preferred, plus, or nice to have. Do not repeat mustHave items.
- Keep each requirement short (2–8 words) and about one thing. Split lists like "React and TypeScript" into separate items.
- stack: every technology named anywhere in the post, once each, in its usual spelling.
- Ignore company marketing, benefits and application instructions.
- If something is not stated, use null (or "unknown" for seniority and remote).`;

export type ExtractJobResult = {
  data: JobExtraction;
  provider: string;
  modelId: string;
  ms: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  truncated: boolean;
};

export async function extractJob(rawText: string): Promise<ExtractJobResult> {
  const text = rawText.trim();
  if (text.length < 50) {
    throw new Error("That's too short to be a job post. Paste the full text.");
  }
  const truncated = text.length > MAX_CHARS;

  const { provider, modelId, model } = getModel();
  const started = Date.now();

  const { output, usage } = await generateText({
    model,
    instructions: INSTRUCTIONS,
    prompt: `Job post:\n"""\n${text.slice(0, MAX_CHARS)}\n"""`,
    output: Output.object({
      schema: JobExtraction,
      name: "job_extraction",
      description: "Structured requirements from one job post",
    }),
    temperature: 0,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  });

  return {
    data: tidy(output),
    provider,
    modelId,
    ms: Date.now() - started,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    truncated,
  };
}

/** Trim items, drop blanks and case-insensitive duplicates. */
function tidy(data: JobExtraction): JobExtraction {
  const clean = (items: string[]) => {
    const seen = new Set<string>();
    return items
      .map((item) => item.trim())
      .filter((item) => {
        const key = item.toLowerCase();
        if (!item || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const mustHave = clean(data.mustHave);
  const mustKeys = new Set(mustHave.map((item) => item.toLowerCase()));

  return {
    ...data,
    mustHave,
    niceToHave: clean(data.niceToHave).filter(
      (item) => !mustKeys.has(item.toLowerCase()),
    ),
    stack: clean(data.stack),
  };
}
