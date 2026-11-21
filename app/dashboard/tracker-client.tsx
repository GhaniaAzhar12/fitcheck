"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ClientRow,
  filterRows,
  isOverdue,
  JOB_STATUSES,
  type JobStatus,
  type SortKey,
  type StatusFilter,
  scoreBand,
  sortRows,
  statusCounts,
  statusLabel,
} from "@/lib/tracker";

import { type TrackerResult, updateFollowUp, updateJobStatus } from "./actions";
import { DeleteJobButton } from "./delete-job-button";

const SCORE_STYLE = {
  strong: "text-met",
  maybe: "text-partial",
  weak: "text-gap",
  none: "text-muted-foreground",
} as const;

const FIELD =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** The viewer's local date as "YYYY-MM-DD". */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TrackerClient({ initialRows }: { initialRows: ClientRow[] }) {
  // Local copy so edits show instantly; refreshed when the server re-renders.
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);

  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("updated");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  // Read the date in the browser so "overdue" uses the viewer's own day.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localToday()), []);

  const counts = useMemo(() => statusCounts(rows), [rows]);
  const visible = useMemo(
    () => sortRows(filterRows(rows, filter), sort),
    [rows, filter, sort],
  );
  const overdueCount = today
    ? rows.filter((r) => isOverdue(r.followUp, today)).length
    : 0;

  /** Optimistic update: show the change now, undo it if saving fails. */
  function save(
    row: ClientRow,
    patch: Partial<ClientRow>,
    action: () => Promise<TrackerResult>,
  ) {
    setRows((all) =>
      all.map((r) => (r.id === row.id ? { ...r, ...patch } : r)),
    );
    setErrors(({ [row.id]: _, ...rest }) => rest);
    setSavingId(row.id);
    startTransition(async () => {
      const result = await action();
      setSavingId((id) => (id === row.id ? null : id));
      if (!result.ok) {
        setRows((all) => all.map((r) => (r.id === row.id ? row : r)));
        setErrors((e) => ({ ...e, [row.id]: result.error }));
        toast.error(`Couldn't save ${row.role}: ${result.error}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-0">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Filter by status</legend>
          {(["ALL", ...JOB_STATUSES] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                filter === s
                  ? "border-foreground/30 bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "ALL" ? "All" : statusLabel(s)}{" "}
              <span className="tabular-nums opacity-70">{counts[s]}</span>
            </button>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={FIELD}
          >
            <option value="updated">Recently updated</option>
            <option value="score">Score, high to low</option>
            <option value="followUp">Follow-up, soonest</option>
          </select>
        </label>
      </div>

      {overdueCount ? (
        <p className="px-4 text-sm text-destructive sm:px-0">
          {overdueCount} follow-up{overdueCount === 1 ? " is" : "s are"}{" "}
          overdue.
        </p>
      ) : null}

      {visible.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 sm:pl-2">Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="pr-4 sm:pr-2">
                <span className="sr-only">Delete</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const overdue = today ? isOverdue(row.followUp, today) : false;
              const label = `${row.role}${row.company ? ` at ${row.company}` : ""}`;
              return (
                <TableRow
                  key={row.id}
                  className={
                    overdue ? "bg-destructive/5 hover:bg-destructive/10" : ""
                  }
                >
                  <TableCell className="pl-4 text-muted-foreground sm:pl-2">
                    {row.company ?? "–"}
                  </TableCell>
                  <TableCell className="max-w-56 font-medium">
                    <Link
                      href={`/jobs/${row.id}`}
                      className="line-clamp-2 underline-offset-4 hover:underline"
                    >
                      {row.role}
                    </Link>
                    {errors[row.id] ? (
                      <p
                        role="alert"
                        className="text-xs font-normal text-destructive"
                      >
                        {errors[row.id]}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${SCORE_STYLE[scoreBand(row.score)]}`}
                  >
                    {row.score ?? "–"}
                  </TableCell>
                  <TableCell>
                    <select
                      aria-label={`Status of ${label}`}
                      value={row.status}
                      onChange={(e) => {
                        const status = e.target.value as JobStatus;
                        save(row, { status }, () =>
                          updateJobStatus(row.id, status),
                        );
                      }}
                      className={FIELD}
                    >
                      {JOB_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <input
                      type="date"
                      aria-label={`Follow-up date for ${label}${overdue ? " (overdue)" : ""}`}
                      value={row.followUp ?? ""}
                      onChange={(e) => {
                        const day = e.target.value;
                        save(row, { followUp: day || null }, () =>
                          updateFollowUp(row.id, day),
                        );
                      }}
                      className={`${FIELD} ${overdue ? "border-destructive/50 font-medium text-destructive" : ""}`}
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {savingId === row.id
                      ? "Saving…"
                      : new Date(row.updatedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                  </TableCell>
                  <TableCell className="pr-4 sm:pr-2">
                    <DeleteJobButton
                      jobId={row.id}
                      label={label}
                      onDeleted={() =>
                        setRows((all) => all.filter((r) => r.id !== row.id))
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-0">
          No jobs with this status.
        </p>
      )}
    </div>
  );
}
