import "server-only";

import { type IndexedChunk, indexCv } from "@/lib/agent/cv-search";
import type { VectorHit } from "@/lib/agent/hybrid-search";
import {
  EMBED_MODEL_ID,
  EMBED_MODEL_LABEL,
  embedDocuments,
} from "@/lib/cv-embeddings";
import { db } from "@/lib/db";
import { recordUsage } from "@/lib/usage";

/** pgvector's text form: "[0.1,0.2,…]". */
const toVector = (v: number[]) => JSON.stringify(v);

/**
 * Makes the user's stored chunks match this CV. Unchanged chunks keep their
 * vectors; any difference replaces them all (without vectors). Runs under a
 * per-user lock, so two analyses or an upload at once can't duplicate rows.
 * Called on upload and before every free-tier analysis.
 */
export async function saveCvChunks(
  userId: string,
  cvText: string,
): Promise<void> {
  const chunks = indexCv(cvText);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cv_chunk:${userId}`}))`;
    const stored = await tx.cvChunk.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      select: { position: true, section: true, text: true },
    });
    const same =
      stored.length === chunks.length &&
      stored.every(
        (c, i) =>
          c.position === chunks[i].position &&
          c.section === chunks[i].section &&
          c.text === chunks[i].text,
      );
    if (same) return;
    await tx.cvChunk.deleteMany({ where: { userId } });
    await tx.cvChunk.createMany({
      data: chunks.map(({ position, section, text }) => ({
        userId,
        position,
        section,
        text,
      })),
    });
  });
}

/** The user's chunks in CV order. */
export async function loadCvChunks(userId: string): Promise<IndexedChunk[]> {
  return db.cvChunk.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { position: true, section: true, text: true },
  });
}

/**
 * Makes sure every chunk matches the current CV and has a vector from the
 * current model: syncs the chunks, then embeds rows with no vector or
 * another model's. Returns false on any
 * failure (logged, never thrown), so the caller falls back to keywords.
 */
export async function ensureEmbeddings({
  userId,
  cvText,
  jobId,
  embed = embedDocuments,
}: {
  userId: string;
  cvText: string;
  jobId?: string;
  embed?: typeof embedDocuments;
}): Promise<boolean> {
  try {
    // Also covers CVs uploaded before this feature, and an upload whose
    // chunk save failed (the stored chunks would be from the old CV).
    await saveCvChunks(userId, cvText);
    const todo = await db.cvChunk.findMany({
      where: {
        userId,
        OR: [{ model: null }, { model: { not: EMBED_MODEL_LABEL } }],
      },
      orderBy: { position: "asc" },
      select: { id: true, text: true },
    });
    // Rows with a model but a null vector can't happen: both are set together.
    if (!todo.length) return true;

    const { vectors, tokens, ms } = await embed(todo.map((c) => c.text));
    await db.$transaction(
      todo.map(
        (c, i) => db.$executeRaw`
          UPDATE cv_chunk
          SET embedding = ${toVector(vectors[i])}::vector, model = ${EMBED_MODEL_LABEL}
          WHERE id = ${c.id}`,
      ),
    );
    await recordUsage({
      userId,
      jobId,
      kind: "EMBED",
      provider: "google",
      model: EMBED_MODEL_ID,
      inputTokens: tokens,
      ms,
    });
    return true;
  } catch (error) {
    console.error(
      "[cv-chunks] embedding failed, using keyword search",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * The user's chunks closest in meaning to the query vector (cosine), with
 * an exact scan: about 50 rows per user don't need an approximate index.
 */
export async function vectorSearch(
  userId: string,
  query: number[],
  limit = 10,
): Promise<VectorHit[]> {
  return db.$queryRaw<VectorHit[]>`
    SELECT position, section, text,
      (1 - (embedding <=> ${toVector(query)}::vector))::float8 AS similarity
    FROM cv_chunk
    WHERE "userId" = ${userId}
      AND model = ${EMBED_MODEL_LABEL}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${toVector(query)}::vector
    LIMIT ${limit}`;
}
