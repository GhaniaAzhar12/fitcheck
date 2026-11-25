"use client";

import { type MouseEvent, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { saveCoverNote } from "./tailor-actions";
import { Unverified } from "./unverified-numbers";

type Saved = { text: string; unverified: string[]; editedAt?: string };

export function CoverNoteEditor({
  analysisId,
  initial,
  onHasEditsChange,
}: {
  analysisId: string;
  initial: Saved;
  /** True while there are unsaved edits or a saved edit, so Regenerate can warn. */
  onHasEditsChange?: (hasEdits: boolean) => void;
}) {
  const [saved, setSaved] = useState<Saved>(initial);
  const [text, setText] = useState(initial.text);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const dirty = text.trim() !== saved.text;
  const hasEdits = dirty || Boolean(saved.editedAt);
  useEffect(() => onHasEditsChange?.(hasEdits), [hasEdits, onHasEditsChange]);

  // Don't lose edits to a closed tab or a reload.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save(then?: () => void) {
    setError(null);
    startSaving(async () => {
      const result = await saveCoverNote(analysisId, text);
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
      else toast.success("Cover note saved");
    });
  }

  /** Downloads use the saved text, so save any edits first. */
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
      href={`/api/analyses/${analysisId}/cover-letter?format=${format}`}
      download
      onClick={download}
      aria-disabled={saving}
      className={buttonVariants({ variant: "ghost", size: "xs" })}
    >
      {label}
    </a>
  );

  return (
    <section aria-labelledby="note-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id="note-heading" className="font-semibold">
          <label htmlFor="cover-note">Cover note</label>
        </h3>
        <div className="flex items-center gap-1">
          <CopyButton text={text} />
          {fileLink("pdf", "PDF")}
          {fileLink("docx", "Word")}
        </div>
      </div>

      <Textarea
        id="cover-note"
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
        aria-describedby="cover-note-status"
        className="min-h-48 bg-muted/40 p-4 leading-relaxed md:text-sm"
      />

      <div
        id="cover-note-status"
        className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        {dirty ? (
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
          <span aria-live="polite">
            {saved.editedAt
              ? `Your edit, saved ${new Date(saved.editedAt).toLocaleString(
                  "en-GB",
                  { dateStyle: "medium", timeStyle: "short" },
                )}.`
              : "Click the text to edit it."}
          </span>
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
      <Unverified numbers={saved.unverified} />
    </section>
  );
}
