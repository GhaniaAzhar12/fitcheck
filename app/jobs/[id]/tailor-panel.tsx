"use client";

import { useActionState, useEffect, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { aiFormFields, loadAiSettings } from "@/lib/ai-settings";

import type { Tailored } from "@/lib/tailor";

import { type TailorState, tailorApplication } from "./tailor-actions";

function Unverified({ numbers }: { numbers: string[] }) {
  if (!numbers.length) return null;
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      Check: {numbers.join(", ")} {numbers.length === 1 ? "isn't" : "aren't"} in
      your CV. Edit or remove before using.
    </p>
  );
}

export function TailorPanel({
  analysisId,
  saved,
}: {
  analysisId: string;
  /** Previously generated text, so a reload costs no model call. */
  saved: Tailored | null;
}) {
  const [state, formAction, pending] = useActionState<TailorState, FormData>(
    tailorApplication,
    saved ? { result: saved } : {},
  );
  // The model choice saved in setup (key stays in this browser).
  const [aiFields, setAiFields] = useState<Record<string, string>>({});
  useEffect(() => setAiFields(aiFormFields(loadAiSettings())), []);

  const result = state.result;
  const allBullets =
    result?.cvBullets.map((b) => `• ${b.text}`).join("\n") ?? "";

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="analysisId" value={analysisId} />
        {Object.entries(aiFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button
          type="submit"
          variant={result ? "outline" : "default"}
          disabled={pending}
        >
          {pending ? "Writing…" : result ? "Regenerate" : "Write tailored text"}
        </Button>
        {pending ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Rewriting your CV for this job. Usually 5–30 seconds.
          </p>
        ) : null}
      </form>

      {state.error && !pending ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {result ? (
        <>
          <section
            aria-labelledby="bullets-heading"
            className="flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="bullets-heading" className="font-semibold">
                CV bullets for this job
              </h3>
              <CopyButton text={allBullets} label="Copy all" />
            </div>
            <ul className="flex flex-col divide-y rounded-lg border">
              {result.cvBullets.map((bullet) => (
                <li key={bullet.text} className="flex flex-col gap-1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed">{bullet.text}</p>
                    <CopyButton text={bullet.text} />
                  </div>
                  <Unverified numbers={bullet.unverified} />
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="note-heading"
            className="flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="note-heading" className="font-semibold">
                Cover note
              </h3>
              <CopyButton text={result.coverNote.text} />
            </div>
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
              {result.coverNote.text}
            </div>
            <Unverified numbers={result.coverNote.unverified} />
          </section>

          <p className="text-xs text-muted-foreground">
            Written only from your CV and the evidence found. {result.provider}/
            {result.modelId} · {(result.ms / 1000).toFixed(1)}s · saved{" "}
            {new Date(result.generatedAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . Always read before you send.
          </p>
        </>
      ) : null}
    </div>
  );
}
