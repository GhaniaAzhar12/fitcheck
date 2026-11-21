import { z } from "zod";

// What the agent concludes for each job requirement. Shared by the server
// and, later, the UI (types only).

export const EVIDENCE_STATUS = ["met", "partial", "gap"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

/** One entry per requirement, as the judge model returns it. */
export const JudgedEvidence = z.object({
  id: z.string().describe("The requirement id, e.g. 'R3'"),
  status: z
    .enum(EVIDENCE_STATUS)
    .describe(
      "met = clear direct proof; partial = related or indirect proof; gap = no proof found",
    ),
  proof: z
    .string()
    .nullable()
    .describe(
      "One sentence on what the proof shows, based only on the research notes. null for a gap",
    ),
  sourceType: z
    .enum(["cv", "repo", "none"])
    .describe("Where the proof comes from"),
  sourceRef: z
    .string()
    .nullable()
    .describe(
      "For cv: the CV section, e.g. 'EXPERIENCE'. For repo: 'owner/name:path' or 'owner/name:path:line'. null for none",
    ),
});

export const JudgedEvidenceList = z.object({
  evidence: z.array(JudgedEvidence),
});

export type Evidence = {
  requirement: string;
  kind: "mustHave" | "niceToHave";
  status: EvidenceStatus;
  proof: string | null;
  source: { type: "cv" | "repo" | "none"; ref: string | null };
};

export type ToolCallLog = {
  step: number;
  tool: string;
  input: unknown;
  ms: number;
  ok: boolean;
  /** Short description of the result, for logs and the UI. */
  summary: string;
};
