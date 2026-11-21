// Day 14 check: run the whole pipeline on real job links, the way the app
// does: fetch page → extract → save job → evidence agent → score → report.
// Jobs, analyses and reports are saved to the first user's account, so they
// show up on the dashboard.
//
//   bun run pipeline:try <url> [<url> …]

import { Octokit } from "@octokit/rest";

import type { Evidence } from "@/lib/agent/evidence";
import { octokitRepoApi } from "@/lib/agent/repo-files";
import { db } from "@/lib/db";
import { extractJob } from "@/lib/extract-job";
import { fetchJobPage } from "@/lib/fetch-job-page";
import { streamFitReport } from "@/lib/fit-report";
import type { JobExtraction } from "@/lib/job-extraction";
import { parseReport } from "@/lib/report-blocks";
import { runAnalysis } from "@/lib/run-analysis";

const urls = process.argv.slice(2);
if (!urls.length) throw new Error("Pass one or more job URLs.");

const profile = await db.profile.findFirstOrThrow({
  select: { userId: true, cvText: true },
});
const account = await db.account.findFirstOrThrow({
  where: { userId: profile.userId, providerId: "github" },
  select: { accessToken: true },
});
const github = octokitRepoApi(
  new Octokit({
    auth: account.accessToken ?? undefined,
    userAgent: "fitcheck",
  }),
);

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const summary: string[] = [];

for (const url of urls) {
  console.log(`\n━━ ${url}`);
  const t0 = Date.now();
  try {
    const rawText = await fetchJobPage(url);
    const t1 = Date.now();
    const extracted = await extractJob(rawText);
    const job = extracted.data;
    const saved = await db.job.create({
      data: { userId: profile.userId, url, rawText, extracted: job },
      select: { id: true },
    });
    const t2 = Date.now();
    console.log(
      `fetched ${rawText.length} chars (${secs(t1 - t0)}) · extracted "${job.title}" at ${job.company ?? "?"} · ${job.remote}${job.location ? ` (${job.location})` : ""} · ${job.mustHave.length}+${job.niceToHave.length} reqs (${secs(t2 - t1)})`,
    );

    const { analysisId, score } = await runAnalysis({
      userId: profile.userId,
      jobId: saved.id,
      github,
    });
    const analysis = await db.analysis.findUniqueOrThrow({
      where: { id: analysisId },
      select: { evidence: true, toolCalls: true },
    });
    const evidence = analysis.evidence as Evidence[];
    const n = (s: string) => evidence.filter((e) => e.status === s).length;
    const t3 = Date.now();
    console.log(
      `analysis: score ${score} · ${n("met")} met / ${n("partial")} partial / ${n("gap")} gap · ${(analysis.toolCalls as unknown[]).length} tool calls (${secs(t3 - t2)})`,
    );

    const report = streamFitReport({
      job: job as JobExtraction,
      evidence,
      score,
      cvText: profile.cvText ?? "",
      onDone: async (text) => {
        await db.analysis.update({
          where: { id: analysisId },
          data: { report: text },
        });
      },
    });
    const text = await report.text;
    await new Promise((r) => setTimeout(r, 500)); // let onEnd save
    const verdict = parseReport(text).find((b) => b.type === "verdict");
    const why =
      text.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";
    console.log(
      `report: ${verdict?.type === "verdict" ? verdict.label : "no verdict"} (${secs(Date.now() - t3)})\n  ${why.slice(0, 220)}`,
    );
    summary.push(
      `${score ?? "–"}\t${verdict?.type === "verdict" ? verdict.label : "?"}\t${job.title} · ${job.company ?? "?"}\t${secs(Date.now() - t0)}\t/jobs/${saved.id}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${message}`);
    summary.push(
      `–\tFAILED\t${url}\t${secs(Date.now() - t0)}\t${message.slice(0, 80)}`,
    );
  }
}

console.log("\nscore\tverdict\tjob\ttime\tlink");
for (const line of summary) console.log(line);
await db.$disconnect();
