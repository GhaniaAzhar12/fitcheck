import {
  generateText,
  Output,
  type StopCondition,
  stepCountIs,
  type ToolSet,
} from "ai";

import type { JobExtraction } from "@/lib/job-extraction";
import { getModel } from "@/lib/model";

import { chunkCv } from "./cv-search";
import {
  type Evidence,
  JudgedEvidenceList,
  type ToolCallLog,
} from "./evidence";
import type { RepoApi } from "./repo-files";
import { createEvidenceTools } from "./tools";

export const MAX_STEPS = 8;
/** GitHub calls (list/read). CV searches are local and free, so not counted. */
export const MAX_GITHUB_CALLS = 12;
const RESEARCH_TIMEOUT_MS = 120_000;
const JUDGE_TIMEOUT_MS = 90_000;
const MAX_NOTES_CHARS = 40_000;
const NOTE_FILE_LINES = 150;

export type Requirement = {
  id: string;
  text: string;
  kind: "mustHave" | "niceToHave";
};

/** Numbers requirements R1, R2… so the judge's answers map back exactly. */
export function requirementsList(job: JobExtraction): Requirement[] {
  return [
    ...job.mustHave.map((text) => ({ text, kind: "mustHave" as const })),
    ...job.niceToHave.map((text) => ({ text, kind: "niceToHave" as const })),
  ].map((r, i) => ({ ...r, id: `R${i + 1}` }));
}

const RESEARCH_INSTRUCTIONS = `You are researching whether a job candidate meets each requirement of a job.
You have tools to search their CV and read their GitHub repos. You have at most ${MAX_STEPS} steps, so work efficiently:
1. In your first step, call list_repo_files for every repo AND search_cv once per requirement, all in parallel. Each search_cv query is ONE requirement in a few words (e.g. "React Testing Library"), never a list of many skills.
2. Then read_file on the files most likely to prove requirements: README.md, package.json, schema files, and code that matches the stack. Prefer code that shows the skill in use.
3. Search the CV again with different words for any requirement still unproven.
4. Stop when you have looked for every requirement, then write a short summary of what you found for each requirement id.
Never invent evidence. If nothing proves a requirement, say so.`;

const JUDGE_INSTRUCTIONS = `You judge job requirements against research notes about a candidate.
Return exactly one entry for every requirement id.
- met: clear proof of real use: a CV experience or project line that describes doing it, or repo code that does it.
- partial: weaker proof: the skill only appears in a CV skills list, a dependency in package.json with no code shown, a similar technology, or a smaller scope.
- gap: nothing in the notes proves it.
A bare mention in a skills list is never "met" on its own.
Use ONLY the notes. Never invent projects, files, numbers or skills.
proof: one short sentence naming the concrete thing that proves it.
sourceRef: for cv use the CV section name; for repo use "owner/name:path" (add ":line" if the notes show the line).`;

/** Stop once enough GitHub calls have been made, even mid-way through steps. */
export function githubCallsAtLeast(max: number): StopCondition<ToolSet> {
  return ({ steps }) =>
    steps.reduce(
      (n, step) =>
        n + step.toolCalls.filter((c) => c.toolName !== "search_cv").length,
      0,
    ) >= max;
}

function summarize(
  tool: string,
  result: unknown,
): { ok: boolean; summary: string } {
  const r = result as Record<string, unknown> | null;
  if (r && typeof r.error === "string") return { ok: false, summary: r.error };
  if (tool === "search_cv") {
    const matches = (r?.matches as { section: string | null }[]) ?? [];
    return {
      ok: true,
      summary: matches.length
        ? `${matches.length} match(es), top in ${matches[0]?.section ?? "no section"}`
        : "no matches",
    };
  }
  if (tool === "list_repo_files") {
    return { ok: true, summary: `${r?.total ?? 0} source files in ${r?.repo}` };
  }
  if (tool === "read_file") {
    return { ok: true, summary: `${r?.path}, ${r?.totalLines} lines` };
  }
  return { ok: true, summary: "done" };
}

/** Wraps every tool so each call is timed and logged. */
function withLogging<T extends ToolSet>(
  tools: T,
  log: Map<string, ToolCallLog>,
  onLog?: (entry: ToolCallLog) => void,
): T {
  const wrapped: ToolSet = {};
  for (const [name, t] of Object.entries(tools)) {
    const execute = t.execute;
    if (!execute) {
      wrapped[name] = t;
      continue;
    }
    wrapped[name] = {
      ...t,
      execute: async (input: unknown, options: { toolCallId: string }) => {
        const started = Date.now();
        try {
          const result = await (execute as (i: unknown, o: unknown) => unknown)(
            input,
            options,
          );
          const entry: ToolCallLog = {
            step: 0, // filled in after the run
            tool: name,
            input,
            ms: Date.now() - started,
            ...summarize(name, result),
          };
          log.set(options.toolCallId, entry);
          onLog?.(entry);
          return result;
        } catch (error) {
          const entry: ToolCallLog = {
            step: 0,
            tool: name,
            input,
            ms: Date.now() - started,
            ok: false,
            summary: error instanceof Error ? error.message : "failed",
          };
          log.set(options.toolCallId, entry);
          onLog?.(entry);
          throw error;
        }
      },
    } as ToolSet[string];
  }
  return wrapped as T;
}

/** Turns tool results into compact notes for the judge. */
function notesFrom(
  steps: {
    toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
    toolResults: { toolCallId: string; output: unknown }[];
  }[],
  summary: string,
) {
  const parts: string[] = [];
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const output = step.toolResults.find(
        (r) => r.toolCallId === call.toolCallId,
      )?.output as Record<string, unknown> | undefined;
      let body = JSON.stringify(output ?? {});
      if (
        call.toolName === "read_file" &&
        typeof output?.content === "string"
      ) {
        body = `${output.path}\n${output.content.split("\n").slice(0, NOTE_FILE_LINES).join("\n")}`;
      }
      parts.push(`## ${call.toolName}(${JSON.stringify(call.input)})\n${body}`);
    }
  }
  if (summary.trim()) parts.push(`## Researcher's summary\n${summary.trim()}`);
  return parts.join("\n\n").slice(0, MAX_NOTES_CHARS);
}

/**
 * Keeps only claims the research supports: requirements the judge skipped
 * become gaps, and a "met" that cites a repo file the tools never saw is
 * downgraded to partial.
 */
export function finalizeEvidence(
  requirements: Requirement[],
  judged: {
    id: string;
    status: Evidence["status"];
    proof: string | null;
    sourceType: Evidence["source"]["type"];
    sourceRef: string | null;
  }[],
  seen: { repos: string[]; files: Set<string>; cvSections: Set<string> },
): Evidence[] {
  const byId = new Map(judged.map((j) => [j.id.trim().toUpperCase(), j]));

  return requirements.map((req) => {
    const j = byId.get(req.id);
    if (!j) {
      return {
        requirement: req.text,
        kind: req.kind,
        status: "gap",
        proof: null,
        source: { type: "none", ref: null },
      };
    }

    let status = j.status;
    let source: Evidence["source"] = {
      type: j.status === "gap" ? "none" : j.sourceType,
      ref: j.status === "gap" ? null : j.sourceRef?.trim() || null,
    };

    if (source.type === "repo") {
      const [repo, path] = (source.ref ?? "").split(":");
      const known =
        repo &&
        seen.repos.includes(repo) &&
        path &&
        seen.files.has(`${repo}:${path}`);
      if (!known) {
        if (status === "met") status = "partial";
        source = {
          type: "repo",
          ref: repo && seen.repos.includes(repo) ? repo : null,
        };
      }
    }
    if (
      source.type === "cv" &&
      source.ref &&
      !seen.cvSections.has(source.ref.toUpperCase())
    ) {
      source = { type: "cv", ref: null };
    }

    return {
      requirement: req.text,
      kind: req.kind,
      status,
      proof: status === "gap" ? null : j.proof,
      source,
    };
  });
}

export type FindEvidenceResult = {
  evidence: Evidence[];
  toolCalls: ToolCallLog[];
  steps: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  modelId: string;
};

export async function findEvidence(options: {
  job: JobExtraction;
  cvText: string;
  repos: string[];
  github: RepoApi;
  modelOptions?: Parameters<typeof getModel>[0];
  /** Called as each tool call finishes, e.g. to print a live log. */
  onToolCall?: (entry: ToolCallLog) => void;
}): Promise<FindEvidenceResult> {
  const { job, cvText, repos, github } = options;
  const requirements = requirementsList(job);
  const { provider, modelId, model } = getModel(options.modelOptions);
  const started = Date.now();

  if (!requirements.length) {
    return {
      evidence: [],
      toolCalls: [],
      steps: 0,
      ms: 0,
      inputTokens: 0,
      outputTokens: 0,
      provider,
      modelId,
    };
  }

  const log = new Map<string, ToolCallLog>();
  const tools = withLogging(
    createEvidenceTools({ cvText, repos, github }),
    log,
    options.onToolCall,
  );

  const reqText = requirements
    .map(
      (r) =>
        `${r.id} [${r.kind === "mustHave" ? "must have" : "nice to have"}] ${r.text}`,
    )
    .join("\n");

  // Phase 1: the agent researches with tools.
  const research = await generateText({
    model,
    instructions: RESEARCH_INSTRUCTIONS,
    prompt: `Job: ${job.title}${job.company ? ` at ${job.company}` : ""}\nStack: ${job.stack.join(", ") || "not stated"}\n\nRequirements:\n${reqText}\n\nCandidate's repos: ${repos.join(", ") || "none"}`,
    tools,
    stopWhen: [stepCountIs(MAX_STEPS), githubCallsAtLeast(MAX_GITHUB_CALLS)],
    temperature: 0,
    abortSignal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
  });

  // Number each logged call by the step it ran in.
  research.steps.forEach((step, i) => {
    for (const call of step.toolCalls) {
      const entry = log.get(call.toolCallId);
      if (entry) entry.step = i + 1;
    }
  });

  // What the tools actually returned, for checking the judge's citations.
  const files = new Set<string>();
  for (const step of research.steps) {
    for (const result of step.toolResults) {
      const out = result.output as
        | { repo?: string; files?: string[]; path?: string }
        | undefined;
      if (out?.repo && out.files)
        for (const f of out.files) files.add(`${out.repo}:${f}`);
      if (out?.repo && out.path) files.add(`${out.repo}:${out.path}`);
    }
  }
  const cvSections = new Set(
    chunkCv(cvText).flatMap((c) =>
      c.section ? [c.section.toUpperCase()] : [],
    ),
  );

  // Phase 2: a separate call judges each requirement from the notes.
  const judge = await generateText({
    model,
    instructions: JUDGE_INSTRUCTIONS,
    prompt: `Requirements:\n${reqText}\n\nResearch notes:\n${notesFrom(research.steps, research.text)}`,
    output: Output.object({ schema: JudgedEvidenceList, name: "evidence" }),
    temperature: 0,
    abortSignal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
  });

  return {
    evidence: finalizeEvidence(requirements, judge.output.evidence, {
      repos,
      files,
      cvSections,
    }),
    toolCalls: [...log.values()].sort((a, b) => a.step - b.step),
    steps: research.steps.length,
    ms: Date.now() - started,
    inputTokens:
      (research.totalUsage.inputTokens ?? 0) + (judge.usage.inputTokens ?? 0),
    outputTokens:
      (research.totalUsage.outputTokens ?? 0) + (judge.usage.outputTokens ?? 0),
    provider,
    modelId,
  };
}
