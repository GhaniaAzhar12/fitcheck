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
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
};

export const SavedTailored = z.object({
  cvBullets: z.array(Checked),
  // editedAt is set once the person has changed the generated note.
  coverNote: Checked.extend({ editedAt: z.string().optional() }),
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

export const MAX_COVER_NOTE_CHARS = 5_000;

/**
 * The saved tailoring with the cover note replaced by the person's edit.
 * Returns an error message instead when the text can't be saved.
 */
export function withEditedCoverNote(
  saved: SavedTailored,
  text: string,
  unverified: string[],
  now: Date,
): SavedTailored | { error: string } {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return { error: "The cover note can't be empty." };
  if (trimmed.length > MAX_COVER_NOTE_CHARS) {
    return {
      error: `Keep the cover note under ${MAX_COVER_NOTE_CHARS.toLocaleString("en-GB")} characters.`,
    };
  }
  return {
    ...saved,
    coverNote: { text: trimmed, unverified, editedAt: now.toISOString() },
  };
}

export function readInterview(value: unknown): SavedInterview | null {
  const parsed = SavedInterview.safeParse(value);
  return parsed.success ? parsed.data : null;
}
