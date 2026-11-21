// Day 5 check: run extractJob on job posts and print the structured result.
//
//   bun run extract:try                      → every file in fixtures/jobs
//   bun run extract:try path/to/post.txt     → one file
//
// Runs with the "react-server" condition so `server-only` imports work.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { extractJob } from "@/lib/extract-job";
import { JobExtraction } from "@/lib/job-extraction";

const FIXTURES = "fixtures/jobs";

async function files() {
  const args = process.argv.slice(2);
  if (args.length) return args;
  const names = (await readdir(FIXTURES)).filter((n) => n.endsWith(".txt"));
  return names.sort().map((n) => join(FIXTURES, n));
}

let failed = 0;

for (const file of await files()) {
  console.log(`\n━━ ${file}`);
  try {
    const text = await readFile(file, "utf8");
    const result = await extractJob(text);
    // Double-check against the schema, independent of the SDK.
    const check = JobExtraction.safeParse(result.data);
    if (!check.success) throw new Error(check.error.message);

    console.log(JSON.stringify(result.data, null, 2));
    console.log(
      `✓ valid · ${result.provider}/${result.modelId} · ${(result.ms / 1000).toFixed(1)}s · tokens ${result.inputTokens} in / ${result.outputTokens} out${result.truncated ? " · text was cut" : ""}`,
    );
  } catch (error) {
    failed++;
    console.log(`✗ ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(failed ? `\n${failed} failed` : "\nAll valid");
process.exit(failed ? 1 : 0);
