import "server-only";

import { z } from "zod";

import type { Provider } from "@/lib/model";

export type AiChoice = { provider: Provider; apiKey?: string } | undefined;

const OwnKey = z.object({
  aiProvider: z.enum(["google", "anthropic"]),
  aiKey: z.string().trim().min(20).max(300),
});

/**
 * Reads the visitor's model choice from a form. Returns undefined for the
 * app's default model. The key is used for this request only, never stored.
 */
export function aiChoiceFrom(formData: FormData): AiChoice {
  const provider = formData.get("aiProvider");

  // Local Ollama only exists on a developer's machine.
  if (provider === "ollama") {
    return process.env.NODE_ENV === "development"
      ? { provider: "ollama" }
      : undefined;
  }

  const parsed = OwnKey.safeParse({
    aiProvider: provider,
    aiKey: formData.get("aiKey"),
  });
  return parsed.success
    ? { provider: parsed.data.aiProvider, apiKey: parsed.data.aiKey }
    : undefined;
}
