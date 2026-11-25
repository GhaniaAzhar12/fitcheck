// Checks the pgvector side of CV search against a throwaway user:
//   bun run check:vector
// No AI calls: vectors are made up. Prints pass/fail lines only.

import { cosineSimilarity } from "ai";

import {
  ensureEmbeddings,
  loadCvChunks,
  saveCvChunks,
  vectorSearch,
} from "@/lib/cv-chunks";
import { EMBED_DIMENSIONS, EMBED_MODEL_LABEL } from "@/lib/cv-embeddings";
import { db } from "@/lib/db";

const USER_ID = "check-vector-user";
let failed = 0;

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

/** A unit-ish vector pointing mostly along `axis`, with a little of `mix`. */
function vector(axis: number, mix = 0, amount = 0): number[] {
  const v = new Array(EMBED_DIMENSIONS).fill(0);
  v[axis] = 1;
  if (amount) v[mix] = amount;
  return v;
}

const fakeEmbed = async (texts: string[]) => ({
  vectors: texts.map((_, i) => vector(i % EMBED_DIMENSIONS)),
  tokens: 0,
  ms: 1,
});

const CV_A = `EXPERIENCE
• Integrated Stripe checkout for a gift shop
• Designed REST services for a logistics platform
• Mentored two junior developers
• Cut page load times by 30%
• Wrote Playwright tests for checkout
• Ran weekly releases on Vercel`;
const CV_B = `EXPERIENCE
• Built a React Native app for field workers`;

const rows = () =>
  db.$queryRaw<{ position: number; model: string | null; has: boolean }[]>`
    SELECT position, model, embedding IS NOT NULL AS has
    FROM cv_chunk WHERE "userId" = ${USER_ID} ORDER BY position`;

try {
  await db.user.deleteMany({ where: { id: USER_ID } });
  await db.user.create({
    data: {
      id: USER_ID,
      name: "Vector Check",
      email: "check-vector@fitcheck.test",
      emailVerified: true,
    },
  });

  await check("sql order matches in-memory cosine", async () => {
    await saveCvChunks(USER_ID, CV_A);
    // Chunk i points along axis i, leaning a little toward axis 0.
    const chunks = await loadCvChunks(USER_ID);
    assert(chunks.length === 6, `expected 6 chunks, got ${chunks.length}`);
    const vectors = chunks.map((c) => vector(c.position, 0, 0.1 * c.position));
    await ensureEmbeddings({
      userId: USER_ID,
      cvText: CV_A,
      embed: async () => ({ vectors, tokens: 0, ms: 1 }),
    });
    const query = vector(2, 0, 0.5);
    const hits = await vectorSearch(USER_ID, query, 10);
    const expected = chunks
      .map((c, i) => ({
        position: c.position,
        sim: cosineSimilarity(query, vectors[i]),
      }))
      .sort((a, b) => b.sim - a.sim);
    assert(
      hits.map((h) => h.position).join() ===
        expected.map((e) => e.position).join(),
      `order ${hits.map((h) => h.position)} vs ${expected.map((e) => e.position)}`,
    );
    for (const [i, h] of hits.entries()) {
      assert(
        Math.abs(h.similarity - expected[i].sim) < 1e-6,
        "similarity differs",
      );
    }
  });

  await check("re-upload replaces old chunks", async () => {
    await saveCvChunks(USER_ID, CV_B);
    const chunks = await loadCvChunks(USER_ID);
    assert(chunks.length === 1, `expected 1 chunk, got ${chunks.length}`);
    assert(chunks[0].text.includes("React Native"), "old CV text left behind");
    assert(
      (await rows()).every((r) => !r.has),
      "new chunks shouldn't have vectors yet",
    );
  });

  await check("missing chunks are created and embedded", async () => {
    await db.cvChunk.deleteMany({ where: { userId: USER_ID } });
    const ok = await ensureEmbeddings({
      userId: USER_ID,
      cvText: CV_A,
      embed: fakeEmbed,
    });
    assert(ok === true, "ensureEmbeddings returned false");
    const all = await rows();
    assert(all.length === 6, `expected 6 rows, got ${all.length}`);
    assert(
      all.every((r) => r.has && r.model === EMBED_MODEL_LABEL),
      "rows not embedded",
    );
  });

  await check(
    "embedding failure returns false and leaves the rows",
    async () => {
      await db.cvChunk.deleteMany({ where: { userId: USER_ID } });
      await saveCvChunks(USER_ID, CV_A); // fresh chunks, no vectors yet
      const ok = await ensureEmbeddings({
        userId: USER_ID,
        cvText: CV_A,
        embed: async () => {
          throw new Error("quota");
        },
      });
      assert(ok === false, "expected false");
      assert((await rows()).length === 6, "rows were removed");
    },
  );

  await check("model change triggers re-embed of just that row", async () => {
    await ensureEmbeddings({ userId: USER_ID, cvText: CV_A, embed: fakeEmbed });
    await db.cvChunk.updateMany({
      where: { userId: USER_ID, position: 3 },
      data: { model: "old" },
    });
    let embedded: string[] = [];
    const ok = await ensureEmbeddings({
      userId: USER_ID,
      cvText: CV_A,
      embed: async (texts) => {
        embedded = texts;
        return fakeEmbed(texts);
      },
    });
    assert(ok, "expected true");
    assert(embedded.length === 1, `re-embedded ${embedded.length} rows`);
    assert(
      (await rows()).every((r) => r.model === EMBED_MODEL_LABEL),
      "model not updated",
    );
  });
  await check("stale chunks from an older CV are replaced", async () => {
    // As if the re-upload saved the profile but saving chunks failed.
    await saveCvChunks(USER_ID, CV_A);
    await ensureEmbeddings({ userId: USER_ID, cvText: CV_A, embed: fakeEmbed });
    const ok = await ensureEmbeddings({
      userId: USER_ID,
      cvText: CV_B,
      embed: fakeEmbed,
    });
    assert(ok, "expected true");
    const chunks = await loadCvChunks(USER_ID);
    assert(
      chunks.length === 1 && chunks[0].text.includes("React Native"),
      `still searching the old CV (${chunks.length} chunks)`,
    );
    assert(
      (await rows()).every((r) => r.has),
      "new chunk not embedded",
    );
  });

  await check("two analyses at once don't duplicate chunks", async () => {
    await db.cvChunk.deleteMany({ where: { userId: USER_ID } });
    await Promise.all([
      ensureEmbeddings({ userId: USER_ID, cvText: CV_A, embed: fakeEmbed }),
      ensureEmbeddings({ userId: USER_ID, cvText: CV_A, embed: fakeEmbed }),
    ]);
    const all = await rows();
    assert(all.length === 6, `expected 6 rows, got ${all.length}`);
  });

  await check("re-uploading the same CV keeps its vectors", async () => {
    await ensureEmbeddings({ userId: USER_ID, cvText: CV_A, embed: fakeEmbed });
    await saveCvChunks(USER_ID, CV_A);
    assert(
      (await rows()).every((r) => r.has),
      "vectors were thrown away",
    );
  });
} finally {
  await db.user.deleteMany({ where: { id: USER_ID } });
  const left = await db.cvChunk.count({ where: { userId: USER_ID } });
  console.log(`throwaway user deleted, chunks left: ${left}`);
}

process.exit(failed ? 1 : 0);
