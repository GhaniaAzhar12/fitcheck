"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { aiFormFields, loadAiSettings } from "@/lib/ai-settings";
import { parseReport, type Verdict } from "@/lib/report-blocks";

const VERDICT_STYLE: Record<Verdict, string> = {
  apply:
    "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  plan: "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  skip: "border-destructive/30 bg-destructive/10 text-destructive",
};

type Status = "idle" | "streaming" | "done" | "error";

export function FitReport({
  analysisId,
  initialReport,
}: {
  analysisId: string;
  initialReport: string | null;
}) {
  const [text, setText] = useState(initialReport ?? "");
  const [status, setStatus] = useState<Status>(initialReport ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const generate = useCallback(async () => {
    setStatus("streaming");
    setError(null);
    setText("");

    // The model choice saved in setup (key stays in this browser).
    const body = new FormData();
    for (const [k, v] of Object.entries(aiFormFields(loadAiSettings())))
      body.set(k, v);

    try {
      const res = await fetch(`/api/analyses/${analysisId}/report`, {
        method: "POST",
        body,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Couldn't write the report. Try again.");
      }

      // Read the stream and show text as it arrives.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setText(full);
      }
      if (!full.trim()) {
        throw new Error(
          "The AI model is busy right now. Try again in a moment.",
        );
      }
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't write the report.");
      setStatus("error");
    }
  }, [analysisId]);

  // Start automatically the first time an analysis has no report.
  useEffect(() => {
    if (!initialReport && !started.current) {
      started.current = true;
      void generate();
    }
  }, [initialReport, generate]);

  const blocks = parseReport(text);

  return (
    <section
      aria-label="Fit report"
      aria-busy={status === "streaming"}
      className="flex flex-col gap-3"
    >
      {blocks.length ? (
        <div className="flex flex-col gap-2 text-sm leading-relaxed">
          {blocks.map((block, i) => {
            const key = `${i}-${block.type}`;
            if (block.type === "verdict") {
              return (
                <p
                  key={key}
                  className={`w-fit rounded-lg border px-3 py-1.5 text-base font-semibold ${
                    block.verdict
                      ? VERDICT_STYLE[block.verdict]
                      : "border-border"
                  }`}
                >
                  {block.label || "…"}
                </p>
              );
            }
            if (block.type === "heading") {
              return (
                <h3 key={key} className="pt-2 font-semibold">
                  {block.text}
                </h3>
              );
            }
            if (block.type === "bullet") {
              return (
                <p key={key} className="flex gap-2 pl-1">
                  <span aria-hidden className="text-muted-foreground">
                    •
                  </span>
                  <span>{block.text}</span>
                </p>
              );
            }
            return <p key={key}>{block.text}</p>;
          })}
          {status === "streaming" ? (
            <span
              aria-hidden
              className="inline-block h-4 w-1.5 animate-pulse bg-foreground/60"
            />
          ) : null}
        </div>
      ) : status === "streaming" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Writing your fit report…
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {status === "done" || status === "error" ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void generate()}
          >
            {status === "error" ? "Try again" : "Rewrite report"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
