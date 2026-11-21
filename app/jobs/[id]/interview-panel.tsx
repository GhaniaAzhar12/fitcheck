"use client";

import { useActionState, useEffect, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiFormFields, loadAiSettings } from "@/lib/ai-settings";

import { type InterviewState, prepareInterview } from "./tailor-actions";

export function InterviewPanel({ analysisId }: { analysisId: string }) {
  const [state, formAction, pending] = useActionState<InterviewState, FormData>(
    prepareInterview,
    {},
  );
  // The model choice saved in setup (key stays in this browser).
  const [aiFields, setAiFields] = useState<Record<string, string>>({});
  useEffect(() => setAiFields(aiFormFields(loadAiSettings())), []);

  const questions = state.result?.questions ?? [];
  const practiceSheet = questions
    .map(
      (q, i) =>
        `${i + 1}. ${q.question} (${q.type})\n${q.answer}${q.sourceProject ? `\nBased on: ${q.sourceProject}` : ""}`,
    )
    .join("\n\n");

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="analysisId" value={analysisId} />
        {Object.entries(aiFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button
          type="submit"
          variant={questions.length ? "outline" : "default"}
          disabled={pending}
        >
          {pending
            ? "Preparing…"
            : questions.length
              ? "New questions"
              : "Prepare interview questions"}
        </Button>
        {pending ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Writing 10 questions with answers from your projects. Usually 10–40
            seconds.
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

      {questions.length ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {questions.filter((q) => q.type === "technical").length} technical
              · {questions.filter((q) => q.type === "behavioural").length}{" "}
              behavioural
            </p>
            <CopyButton text={practiceSheet} label="Copy all" />
          </div>

          <Accordion className="rounded-lg border px-3">
            {questions.map((q, i) => (
              <AccordionItem key={q.question} value={i}>
                <AccordionTrigger className="gap-3">
                  <span className="flex flex-1 flex-col gap-1.5 text-left sm:flex-row sm:items-start sm:gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1">{q.question}</span>
                    <Badge
                      variant={q.type === "technical" ? "secondary" : "outline"}
                      className="w-fit shrink-0"
                    >
                      {q.type}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-3">
                  {q.whyAsked ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Why they'd ask:</span>{" "}
                      {q.whyAsked}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 leading-relaxed">
                    {q.answer}
                  </p>
                  {q.unverified.length ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Check: {q.unverified.join(", ")}{" "}
                      {q.unverified.length === 1 ? "isn't" : "aren't"} in your
                      CV. Fix before you say it.
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {q.sourceProject
                        ? `Based on: ${q.sourceProject}`
                        : "General answer"}
                    </p>
                    <CopyButton text={`${q.question}\n${q.answer}`} />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <p className="text-xs text-muted-foreground">
            Answers use only your CV and the evidence found. Practise them out
            loud in your own words. {state.result?.provider}/
            {state.result?.modelId} ·{" "}
            {((state.result?.ms ?? 0) / 1000).toFixed(1)}s
          </p>
        </>
      ) : null}
    </div>
  );
}
