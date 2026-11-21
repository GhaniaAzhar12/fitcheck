// Day 11 check: run the evidence agent on one of your saved jobs.
//
//   bun run evidence:try              → your most recent job
//   bun run evidence:try <jobId>      → a specific job
//
// Uses the first user's profile (CV + repos) and GitHub token from the database.

import { Octokit } from "@octokit/rest";

import { findEvidence } from "@/lib/agent/find-evidence";
import { octokitRepoApi } from "@/lib/agent/repo-files";
import { db } from "@/lib/db";
import { JobExtraction } from "@/lib/job-extraction";

const jobId = process.argv[2];

const job = await db.job.findFirst({
  where: jobId ? { id: jobId } : {},
  orderBy: { createdAt: "desc" },
  select: { id: true, userId: true, extracted: true },
});
if (!job) throw new Error("No job found. Add one at /jobs/new first.");

const extracted = JobExtraction.parse(job.extracted);
const profile = await db.profile.findUnique({
  where: { userId: job.userId },
  select: { cvText: true, repos: true },
});
if (!profile?.cvText) throw new Error("This user hasn't uploaded a CV yet.");
const account = await db.account.findFirst({
  where: { userId: job.userId, providerId: "github" },
  select: { accessToken: true },
});

console.log(
  `Job: ${extracted.title}${extracted.company ? ` · ${extracted.company}` : ""} (${job.id})`,
);
console.log(
  `Requirements: ${extracted.mustHave.length} must have, ${extracted.niceToHave.length} nice to have`,
);
console.log(`Repos: ${profile.repos.join(", ") || "none"}\n`);
console.log("Tool calls:");

const result = await findEvidence({
  job: extracted,
  cvText: profile.cvText,
  repos: profile.repos,
  github: octokitRepoApi(
    new Octokit({
      auth: account?.accessToken ?? undefined,
      userAgent: "fitcheck",
    }),
  ),
  onToolCall: (c) =>
    console.log(
      `  ${c.ok ? "✓" : "✗"} ${c.tool}(${JSON.stringify(c.input)}) · ${c.ms} ms · ${c.summary}`,
    ),
});

const icon = { met: "✅", partial: "⚠️ ", gap: "❌" } as const;
console.log("\nEvidence:");
for (const e of result.evidence) {
  const where = e.source.ref ? ` [${e.source.type}: ${e.source.ref}]` : "";
  console.log(
    `  ${icon[e.status]} ${e.kind === "niceToHave" ? "(nice) " : ""}${e.requirement}`,
  );
  if (e.proof) console.log(`       ${e.proof}${where}`);
}

const count = (s: string) =>
  result.evidence.filter((e) => e.status === s).length;
console.log(
  `\n${count("met")} met · ${count("partial")} partial · ${count("gap")} gap` +
    ` · ${result.toolCalls.length} tool calls in ${result.steps} steps` +
    ` · ${(result.ms / 1000).toFixed(1)}s · ${result.inputTokens} in / ${result.outputTokens} out` +
    ` · ${result.provider}/${result.modelId}`,
);
await db.$disconnect();
