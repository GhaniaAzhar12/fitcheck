"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { type UploadCvState, uploadCv } from "./actions";

const MAX_MB = 4;

export function CvUploadForm({ hasCv }: { hasCv: boolean }) {
  const [state, formAction, pending] = useActionState<UploadCvState, FormData>(
    uploadCv,
    {},
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const error = clientError ?? state.error;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        const file = new FormData(event.currentTarget).get("cv");
        if (!(file instanceof File) || file.size === 0) {
          event.preventDefault();
          setClientError("Choose a PDF file first.");
        } else if (file.size > MAX_MB * 1024 * 1024) {
          event.preventDefault();
          setClientError(
            `That file is over ${MAX_MB} MB. Export a smaller PDF.`,
          );
        } else {
          setClientError(null);
        }
      }}
    >
      <label htmlFor="cv" className="text-sm font-medium">
        {hasCv ? "Replace your CV" : "Your CV (PDF)"}
      </label>
      <Input
        id="cv"
        name="cv"
        type="file"
        accept="application/pdf,.pdf"
        disabled={pending}
        onChange={() => setClientError(null)}
        className="h-auto py-2"
      />
      <p className="text-xs text-muted-foreground">
        PDF up to {MAX_MB} MB, 10 pages. We keep the text only, not the file.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {state.saved && !error && !pending ? (
        <output className="text-sm text-muted-foreground">
          Saved. Check the text below looks right.
        </output>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Reading your CV…" : hasCv ? "Upload new CV" : "Upload CV"}
        </Button>
      </div>
    </form>
  );
}
