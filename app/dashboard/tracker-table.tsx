import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { toClientRow, toTrackerRow } from "@/lib/tracker";

import { TrackerClient } from "./tracker-client";

export async function TrackerTable() {
  const { user } = await requireSession();
  const jobs = await db.job.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 200,
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

  if (!jobs.length) {
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

  const rows = jobs.map((job) => toClientRow(toTrackerRow(job)));
  const analysed = rows.filter((r) => r.score !== null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Applications</CardTitle>
        <CardDescription>
          {rows.length} {rows.length === 1 ? "job" : "jobs"} · {analysed}{" "}
          analysed · status and follow-up save as you change them
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <TrackerClient initialRows={rows} />
      </CardContent>
    </Card>
  );
}
