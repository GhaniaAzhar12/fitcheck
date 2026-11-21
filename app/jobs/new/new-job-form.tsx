"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { type CreateJobState, createJob } from "../actions";

const initialState: CreateJobState = {};

export function NewJobForm() {
  const [state, formAction, pending] = useActionState(createJob, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
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
          defaultValue={state.url}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Works with most company career pages. LinkedIn needs a login, so paste
          the text for those.
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
          defaultValue={state.text}
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
