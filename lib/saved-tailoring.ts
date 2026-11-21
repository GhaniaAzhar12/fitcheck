import { z } from "zod";

// Shapes of the tailored text and interview prep as saved on an Analysis.
// Read back with safeParse so an old or broken row falls back to
// "generate" instead of crashing the page.

const Checked = z.object({ text: z.string(), unverified: z.array(z.string()) });

const Meta = {
  provider: z.string(),
  modelId: z.string(),
  ms: z.number(),
  generatedAt: z.string(),
};

export const SavedTailored = z.object({
  cvBullets: z.array(Checked),
  coverNote: Checked,
  ...Meta,
});
export type SavedTailored = z.infer<typeof SavedTailored>;

export const SavedInterview = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      type: z.enum(["technical", "behavioural"]),
      whyAsked: z.string(),
      answer: z.string(),
      sourceProject: z.string().nullable(),
      unverified: z.array(z.string()),
    }),
  ),
  ...Meta,
});
export type SavedInterview = z.infer<typeof SavedInterview>;

export function readTailored(value: unknown): SavedTailored | null {
  const parsed = SavedTailored.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readInterview(value: unknown): SavedInterview | null {
  const parsed = SavedInterview.safeParse(value);
  return parsed.success ? parsed.data : null;
}
