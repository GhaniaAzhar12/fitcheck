import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import {
  scoreBand,
  statusLabel,
  type TrackerRow,
  toTrackerRow,
} from "@/lib/tracker";

const SCORE_STYLE = {
  strong: "text-emerald-700 dark:text-emerald-400",
  maybe: "text-amber-700 dark:text-amber-400",
  weak: "text-destructive",
  none: "text-muted-foreground",
} as const;

const STATUS_VARIANT = {
  SAVED: "outline",
  APPLIED: "secondary",
  INTERVIEW: "default",
  OFFER: "default",
  REJECTED: "outline",
} as const;

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export async function TrackerTable() {
  const { user } = await requireSession();
  const jobs = await db.job.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      extracted: true,
      status: true,
      followUpAt: true,
      updatedAt: true,
      // Only the latest successful run decides the score.
      analyses: {
        where: { status: "DONE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { score: true, createdAt: true },
      },
    },
  });

  const rows: TrackerRow[] = jobs
    .map(toTrackerRow)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const analysed = rows.filter((r) => r.score !== null).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!rows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No jobs yet</CardTitle>
          <CardDescription>
            Add your first job post to see how well you fit it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Applications</CardTitle>
        <CardDescription>
          {rows.length} {rows.length === 1 ? "job" : "jobs"} · {analysed}{" "}
          analysed
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 sm:pl-2">Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead className="pr-4 text-right sm:pr-2">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const overdue = row.followUpAt !== null && row.followUpAt < today;
              return (
                <TableRow key={row.id}>
                  <TableCell className="pl-4 text-muted-foreground sm:pl-2">
                    {row.company ?? "–"}
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-medium">
                    <Link
                      href={`/jobs/${row.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.role}
                    </Link>
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${SCORE_STYLE[scoreBand(row.score)]}`}
                  >
                    {row.score ?? "–"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>
                      {statusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={
                      overdue
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {row.followUpAt ? shortDate(row.followUpAt) : "–"}
                    {overdue ? (
                      <span className="sr-only"> (overdue)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-muted-foreground sm:pr-2">
                    {shortDate(row.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
