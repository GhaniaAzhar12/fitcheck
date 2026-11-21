"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { aiFormFields, loadAiSettings } from "@/lib/ai-settings";

import { type AnalyzeState, analyzeJob } from "./actions";

/** What the agent is probably doing, by seconds elapsed. */
function hint(seconds: number) {
  if (seconds < 4) return "Searching your CV…";
  if (seconds < 15) return "Reading your GitHub repos…";
  if (seconds < 45) return "Judging each requirement…";
  return "Still working. The free AI tier can be slow at busy times…";
}

export function AnalyzeButton({
  jobId,
  rerun,
}: {
  jobId: string;
  rerun: boolean;
}) {
  const [state, formAction, pending] = useActionState<AnalyzeState, FormData>(
    analyzeJob,
    {},
  );
  // The model choice saved in setup (key stays in this browser).
  const [aiFields, setAiFields] = useState<Record<string, string>>({});
  useEffect(() => setAiFields(aiFormFields(loadAiSettings())), []);

  // A run can take a minute, so say when it's done in case they scrolled away.
  useEffect(() => {
    if (state.doneAt) {
      toast.success(
        state.score != null
          ? `Analysis finished: ${state.score}/100`
          : "Analysis finished",
      );
    }
  }, [state.doneAt, state.score]);

  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!pending) return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {Object.entries(aiFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant={rerun ? "outline" : "default"}
          disabled={pending}
        >
          {pending ? "Analysing…" : rerun ? "Run again" : "Analyse my fit"}
        </Button>
        {pending ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {hint(seconds)} <span className="tabular-nums">{seconds}s</span>
          </p>
        ) : null}
      </div>

      {state.error && !pending ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
