"use client";

import { useActionState, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Repo } from "@/lib/github";
import { MAX_REPOS } from "@/lib/onboarding";

import { type SaveReposState, saveRepos } from "./actions";

export function RepoPicker({
  repos,
  saved,
  min,
}: {
  repos: Repo[];
  saved: string[];
  min: number;
}) {
  const [state, formAction, pending] = useActionState<SaveReposState, FormData>(
    saveRepos,
    {},
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(state.selected ?? saved),
  );
  const [query, setQuery] = useState("");
  const [showForks, setShowForks] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter(
      (r) =>
        (showForks || !r.fork || selected.has(r.fullName)) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.language?.toLowerCase().includes(q)),
    );
  }, [repos, query, showForks, selected]);

  const forkCount = repos.filter((r) => r.fork).length;
  const full = selected.size >= MAX_REPOS;
  const enough = selected.size >= min;

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else if (next.size < MAX_REPOS) next.add(name);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Filter by name, language or description"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter repos"
        />
        {forkCount ? (
          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showForks}
              onChange={(e) => setShowForks(e.target.checked)}
            />
            Show forks ({forkCount})
          </label>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="sr-only">Repos to use as evidence</legend>
        {visible.length ? (
          visible.map((repo) => {
            const checked = selected.has(repo.fullName);
            return (
              <label
                key={repo.fullName}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  checked
                    ? "border-foreground/40 bg-muted/60"
                    : "hover:bg-muted/40"
                } ${!checked && full ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  name="repos"
                  value={repo.fullName}
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => toggle(repo.fullName)}
                  className="mt-1"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{repo.name}</span>
                    {repo.language ? (
                      <Badge variant="outline">{repo.language}</Badge>
                    ) : null}
                    {repo.fork ? <Badge variant="secondary">fork</Badge> : null}
                    {repo.stars ? (
                      <span className="text-xs text-muted-foreground">
                        ★ {repo.stars}
                      </span>
                    ) : null}
                  </span>
                  {repo.description ? (
                    <span className="truncate text-sm text-muted-foreground">
                      {repo.description}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">No repos match.</p>
        )}
      </fieldset>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background py-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {selected.size} selected
          {min > 1
            ? ` · pick ${min}–${MAX_REPOS}`
            : ` · pick up to ${MAX_REPOS}`}
        </p>
        <Button type="submit" disabled={pending || !enough}>
          {pending ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}
