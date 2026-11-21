import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Evidence, ToolCallLog } from "@/lib/agent/evidence";
import { db } from "@/lib/db";

import { AnalyzeButton } from "./analyze-button";
import { FitReport } from "./fit-report";

const STATUS = {
  met: { icon: "✅", label: "Met" },
  partial: { icon: "⚠️", label: "Partial" },
  gap: { icon: "❌", label: "Gap" },
} as const;

export async function AnalysisSection({
  jobId,
  autoStart = false,
}: {
  jobId: string;
  /** Just added: start the first analysis without a click. */
  autoStart?: boolean;
}) {
  const [latest, runs] = await Promise.all([
    db.analysis.findFirst({
      where: { jobId },
      orderBy: { createdAt: "desc" },
    }),
    db.analysis.count({ where: { jobId } }),
  ]);

  const done = latest?.status === "DONE" ? latest : null;
  const evidence = (done?.evidence ?? []) as Evidence[];
  const toolCalls = (done?.toolCalls ?? []) as ToolCallLog[];
  const count = (s: Evidence["status"]) =>
    evidence.filter((e) => e.status === s).length;

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Fit analysis</CardTitle>
        <CardDescription>
          {done
            ? "How your CV and GitHub repos match each requirement."
            : "Fitcheck searches your CV and reads your repos for proof of each requirement."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {latest?.status === "FAILED" ? (
          <p className="text-sm text-muted-foreground">
            Last run failed: {latest.error}
          </p>
        ) : null}

        {done ? (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="text-4xl font-semibold tabular-nums">
                {done.score ?? "–"}
                <span className="text-lg font-normal text-muted-foreground">
                  /100
                </span>
              </p>
              <p className="pb-1 text-sm text-muted-foreground">
                {count("met")} met · {count("partial")} partial · {count("gap")}{" "}
                gap
              </p>
            </div>

            {/* Keyed by run so a new analysis starts a fresh report. */}
            <FitReport
              key={done.id}
              analysisId={done.id}
              initialReport={done.report}
            />

            <h3 className="border-t pt-4 text-sm font-semibold">
              Evidence for each requirement
            </h3>
            <ul className="-mt-2 flex flex-col divide-y">
              {evidence.map((e) => (
                <li
                  key={`${e.kind}-${e.requirement}`}
                  className="flex gap-3 py-3"
                >
                  <span aria-hidden className="pt-0.5">
                    {STATUS[e.status].icon}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm font-medium">
                      <span className="sr-only">
                        {STATUS[e.status].label}:{" "}
                      </span>
                      {e.requirement}
                      {e.kind === "niceToHave" ? (
                        <Badge variant="outline" className="ml-2 align-middle">
                          nice to have
                        </Badge>
                      ) : null}
                    </p>
                    {e.proof ? (
                      <p className="text-sm text-muted-foreground">{e.proof}</p>
                    ) : null}
                    {e.source.ref ? (
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {e.source.type === "cv" ? "CV · " : ""}
                        {e.source.ref}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <details className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                How the agent worked ({toolCalls.length} tool calls in{" "}
                {done.steps} steps)
              </summary>
              <ol className="mt-3 flex flex-col gap-1 font-mono text-xs">
                {toolCalls.map((c, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: calls can repeat
                  <li key={i} className={c.ok ? "" : "text-destructive"}>
                    {c.step}. {c.ok ? "✓" : "✗"} {c.tool}(
                    {JSON.stringify(c.input)}) · {c.ms} ms · {c.summary}
                  </li>
                ))}
              </ol>
            </details>

            <p className="text-xs text-muted-foreground">
              {done.provider}/{done.model} · {(done.ms / 1000).toFixed(1)}s ·{" "}
              {done.inputTokens.toLocaleString("en-GB")} tokens in /{" "}
              {done.outputTokens.toLocaleString("en-GB")} out ·{" "}
              {done.createdAt.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {runs > 1 ? ` · ${runs} runs` : ""}
            </p>
          </>
        ) : null}

        <AnalyzeButton
          jobId={jobId}
          rerun={Boolean(done)}
          // Only for a job with no runs yet, so it never repeats work.
          autoStart={autoStart && !latest}
        />
      </CardContent>
    </Card>
  );
}
