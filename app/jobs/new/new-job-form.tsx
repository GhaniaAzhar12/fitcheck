"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aiFormFields, loadAiSettings } from "@/lib/ai-settings";
import type { ImportedJob } from "@/lib/bookmarklet";
import { takeImport } from "@/lib/import-storage";

import { type CreateJobState, createJob } from "../actions";

const initialState: CreateJobState = {};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "another site";
  }
}

export function NewJobForm() {
  const [state, formAction, pending] = useActionState(createJob, initialState);
  // The model choice saved in step 3 of setup (key stays in this browser).
  const [aiFields, setAiFields] = useState<Record<string, string>>({});
  useEffect(() => setAiFields(aiFormFields(loadAiSettings())), []);

  // A job sent by the "Send to Fitcheck" bookmarklet (via /jobs/import).
  const [imported, setImported] = useState<ImportedJob | null>(null);
  const importTaken = useRef(false);
  useEffect(() => {
    // Once only: takeImport removes the job, and dev runs effects twice.
    if (importTaken.current) return;
    importTaken.current = true;
    // Always check: a job sent while signed out is still waiting in this tab
    // after signing in, even though the ?import=1 link was lost.
    setImported(takeImport());
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  const importedFrom = imported ? hostOf(imported.url) : null;

  return (
    <form
      action={formAction}
      // Remount when an import arrives so the fields pick up its values.
      key={imported ? "imported" : "blank"}
      className="flex flex-col gap-6"
    >
      {importedFrom ? (
        <output className="block rounded-lg border bg-card px-4 py-3 text-sm">
          The job from <strong>{importedFrom}</strong> is filled in below. Check
          the text, then click <strong>Extract requirements</strong>.
        </output>
      ) : null}
      {Object.entries(aiFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-2">
        <label htmlFor="url" className="text-sm font-medium">
          Job link
        </label>
        <Input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://company.com/careers/senior-engineer"
          defaultValue={state.url ?? imported?.url}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Works with most company career pages. LinkedIn, Google Jobs and some
          job boards block automated reading, so paste the text for those.
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="text" className="text-sm font-medium">
          Job text
        </label>
        <Textarea
          id="text"
          name="text"
          rows={12}
          placeholder="Paste the full job post here…"
          defaultValue={state.text ?? imported?.text}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          If you fill in both, the text is used.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Reading the job post…" : "Extract requirements"}
        </Button>
        {pending ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            This can take up to a minute on the free AI tier.
          </p>
        ) : null}
      </div>
    </form>
  );
}
