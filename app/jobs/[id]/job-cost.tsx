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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { costUsd, formatUsd, sumUsd } from "@/lib/pricing";

const KIND_LABEL = {
  EXTRACT: "Read job post",
  ANALYSIS: "Fit analysis",
  REPORT: "Fit report",
  TAILOR: "Tailored text",
  INTERVIEW: "Interview prep",
  KEY_CHECK: "Key check",
  EMBED: "CV search vectors",
} as const;

const n = (x: number) => x.toLocaleString("en-GB");

/** Every AI call made for this job: model, tokens, time and cost. */
export async function JobCost({ jobId }: { jobId: string }) {
  const events = await db.usageEvent.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
  });

  if (!events.length) return null;

  const rows = events.map((e) => ({
    ...e,
    cost: costUsd({
      provider: e.provider,
      model: e.model,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      ownKey: e.ownKey,
    }),
  }));
  const total = {
    input: rows.reduce((s, r) => s + r.inputTokens, 0),
    output: rows.reduce((s, r) => s + r.outputTokens, 0),
    ms: rows.reduce((s, r) => s + r.ms, 0),
    cost: sumUsd(rows.map((r) => r.cost)),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost of this job</CardTitle>
        <CardDescription>
          Every AI call made for it. The free model and local models cost
          nothing; your own key is billed by its provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 sm:pl-2">Step</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Tokens in / out</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="pr-4 text-right sm:pr-2">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-4 sm:pl-2">
                  {KIND_LABEL[r.kind]}
                  {r.ok ? null : (
                    <span className="ml-1.5 text-xs text-gap">failed</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.model}
                  {r.ownKey ? " (your key)" : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {n(r.inputTokens)} / {n(r.outputTokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(r.ms / 1000).toFixed(1)}s
                </TableCell>
                <TableCell className="pr-4 text-right tabular-nums sm:pr-2">
                  {formatUsd(r.cost)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="pl-4 font-medium sm:pl-2" colSpan={2}>
                Total ({rows.length} {rows.length === 1 ? "call" : "calls"})
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {n(total.input)} / {n(total.output)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {(total.ms / 1000).toFixed(1)}s
              </TableCell>
              <TableCell className="pr-4 text-right font-medium tabular-nums sm:pr-2">
                {formatUsd(total.cost)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
