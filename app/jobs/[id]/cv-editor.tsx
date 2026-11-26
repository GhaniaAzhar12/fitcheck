"use client";

import { type MouseEvent, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { saveTailoredCv } from "./tailor-actions";
import { Unverified } from "./unverified-numbers";

type Saved = { text: string; unverified: string[]; editedAt?: string };

/**
 * The person's CV, edited for this job. Starts from their CV in Set up
 * (with PDF line breaks tidied) and never changes that copy.
 */
export function CvEditor({
  analysisId,
  original,
  starting,
  initial,
}: {
  analysisId: string;
  /** The CV text exactly as saved in Set up. */
  original: string;
  /** The same CV, tidied: what an unedited tailored CV starts as. */
  starting: string;
  /** The saved edit for this job, if any. */
  initial?: Saved;
}) {
  const [saved, setSaved] = useState<Saved>(
    initial ?? { text: starting, unverified: [] },
  );
  const [text, setText] = useState(saved.text);
  const [view, setView] = useState<"edited" | "original">("edited");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const dirty = text.trim() !== saved.text;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save(then?: () => void) {
    setError(null);
    startSaving(async () => {
      const result = await saveTailoredCv(analysisId, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved({
        text: result.text,
        unverified: result.unverified,
        editedAt: result.editedAt,
      });
      setText(result.text);
      if (then) then();
      else toast.success("CV saved for this job");
    });
  }

  /** Downloads use the saved CV, so save any edits first. */
  function download(e: MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return;
    e.preventDefault();
    const href = e.currentTarget.href;
    save(() => {
      window.location.href = href;
    });
  }

  const fileLink = (format: "pdf" | "docx", label: string) => (
    <a
      href={`/api/analyses/${analysisId}/cv?format=${format}`}
      download
      onClick={download}
      aria-disabled={saving}
      className={buttonVariants({ variant: "ghost", size: "xs" })}
    >
      {label}
    </a>
  );

  const tab = (value: typeof view, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        view === value
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <section aria-labelledby="cv-heading" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 id="cv-heading" className="font-semibold">
            <label htmlFor="tailored-cv">Your CV for this job</label>
          </h3>
          <fieldset
            aria-label="Which version to show"
            className="flex gap-0.5 rounded-lg bg-muted p-0.5"
          >
            {tab("edited", "Edited")}
            {tab("original", "Original")}
          </fieldset>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton text={view === "edited" ? text : original} />
          {fileLink("pdf", "PDF")}
          {fileLink("docx", "Word")}
        </div>
      </div>

      {view === "edited" ? (
        <Textarea
          id="tailored-cv"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              if (dirty && !saving) save();
            }
          }}
          disabled={saving}
          spellCheck
          aria-describedby="tailored-cv-status"
          className="min-h-96 bg-muted/40 p-4 leading-relaxed md:text-sm"
        />
      ) : (
        <section
          aria-label="Original CV from Set up"
          className="max-h-[32rem] min-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm leading-relaxed text-muted-foreground"
        >
          {original}
        </section>
      )}

      <div
        id="tailored-cv-status"
        className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        {view === "original" ? (
          <span>
            Your CV as uploaded in Set up. Edits here never change it.
          </span>
        ) : dirty ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => save()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(saved.text);
                setError(null);
              }}
              disabled={saving}
            >
              Undo changes
            </Button>
            <span aria-live="polite">
              Unsaved changes. PDF and Word save them first.
            </span>
          </>
        ) : (
          <>
            <span aria-live="polite">
              {saved.editedAt
                ? `Edited for this job, saved ${new Date(
                    saved.editedAt,
                  ).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}.`
                : "Paste in the bullets above or change any line. Start lines with • for bullets."}
            </span>
            {text !== starting ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setText(starting)}
              >
                Start again from original
              </Button>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {view === "edited" ? <Unverified numbers={saved.unverified} /> : null}
    </section>
  );
}
