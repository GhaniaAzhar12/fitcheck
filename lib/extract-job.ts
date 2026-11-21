import "server-only";

import { generateText, Output } from "ai";

import { JobExtraction } from "@/lib/job-extraction";
import { getModel, MODEL_RETRIES } from "@/lib/model";

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
- Requirements are ONLY skills, experience, knowledge or qualifications a CV or code could prove.
- NOT requirements (leave them out): how to apply ("complete a take-home", "include X in your email", "send a cover letter", "disclose AI use"), working arrangements ("full-time", "remote", "overlap with CET", "work hours") which belong in remote/location, and generic traits ("self-starter", "onboard quickly", "work without supervision", "team player").
- Ignore company marketing and benefits.
- seniority: use the title's level if it has one. If not, infer it from the minimum years: 0–1 junior, 2–4 mid, 5–7 senior, 8+ lead (principal only if the post says so). Use "unknown" only when neither the title nor the years give a clue.
- Right to work, work authorisation, visa or citizenship rules ARE requirements, even when the same sentence mentions a time zone.
- If something is not stated, use null (or "unknown" for remote).`;

/**
 * Safety net for the rule above: drops items that are clearly application
 * steps or working arrangements even if the model includes them, because
 * nothing on a CV can prove them and they would count as unfair gaps.
 */
const NOT_A_REQUIREMENT = [
  /take[- ]?home|assignment|test task|coding challenge/i,
  /\b(include|mention|add|put)\b.*\b(email|subject|application|cover letter|message)\b/i,
  /\bcover letter\b|\bapply\b|\bapplication\b|\bsubmit\b|\bdisclos/i,
  /\bfull[- ]?time\b|\bpart[- ]?time\b|\bwork(ing)? remotely\b|\btime ?zones?\b|\boverlap\b|\bwork(ing)? hours\b/i,
  /\bonboard quickly\b|\bwithout supervision\b|\bself[- ]?starter\b|\bteam player\b/i,
];

/**
 * Legal eligibility always counts, even inside a sentence that also mentions
 * a time zone ("authorised to work in the US and live in a US time zone").
 * Found by the Day 23 eval: the time-zone rule was dropping these.
 */
const ELIGIBILITY =
  /right to work|work(ing)? authori[sz]|authori[sz]ed to work|eligib\w* to work|\bvisa\b|sponsor|citizen|permit to work|work permit/i;

export function isRealRequirement(item: string): boolean {
  if (ELIGIBILITY.test(item)) return true;
  return !NOT_A_REQUIREMENT.some((pattern) => pattern.test(item));
}

/** A message that is safe to show the user as-is. */
export class JobTextError extends Error {}

export type ExtractJobResult = {
  data: JobExtraction;
  provider: string;
  modelId: string;
  ms: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  truncated: boolean;
};

export async function extractJob(
  rawText: string,
  /** The visitor's own model choice; defaults to the app's model. */
  modelOptions?: Parameters<typeof getModel>[0],
): Promise<ExtractJobResult> {
  const text = rawText.trim();
  if (text.length < 50) {
    throw new JobTextError(
      "That's too short to be a job post. Paste the full text.",
    );
  }
  const truncated = text.length > MAX_CHARS;

  const { provider, modelId, model } = getModel(modelOptions);
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
    maxRetries: MODEL_RETRIES,
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

/** Trim items, drop blanks, duplicates and things that aren't requirements. */
export function tidy(data: JobExtraction): JobExtraction {
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

  const mustHave = clean(data.mustHave).filter(isRealRequirement);
  const mustKeys = new Set(mustHave.map((item) => item.toLowerCase()));

  return {
    ...data,
    mustHave,
    niceToHave: clean(data.niceToHave).filter(
      (item) => !mustKeys.has(item.toLowerCase()) && isRealRequirement(item),
    ),
    stack: clean(data.stack),
  };
}
