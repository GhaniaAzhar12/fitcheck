import { generateText } from "ai";
import { connection } from "next/server";

import { getModel } from "@/lib/model";

// Day 4 check: GET /api/test-model → one line from the configured model.
// Dev only, so nobody can spend your free quota on the live site.
export async function GET() {
  // Run on every request instead of being prerendered at build time.
  await connection();

  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { provider, modelId, model } = getModel();
  const started = Date.now();

  try {
    const { text, usage } = await generateText({
      model,
      prompt: "In one short sentence, say hello to a software engineer.",
      // Fail with an error instead of hanging. Free-tier Gemini can take
      // 15 s+ and the SDK retries on 503s, so leave room for one retry.
      abortSignal: AbortSignal.timeout(60_000),
    });
    return Response.json({
      provider,
      modelId,
      text,
      ms: Date.now() - started,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
  } catch (error) {
    return Response.json(
      {
        provider,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
