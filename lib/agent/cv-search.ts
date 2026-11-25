// Keyword search over CV text, used by the search_cv tool.
// Plain functions with no I/O so they are easy to unit test.

export type CvChunk = { section: string | null; text: string };
export type CvMatch = CvChunk & { score: number };
/** A chunk with its place in the CV (0-based), the id used to merge rankings. */
export type IndexedChunk = CvChunk & { position: number };

const BULLET = /^[-•*▪◦●–]\s*/;

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it of on or the to with experience experienced knowledge strong solid using use used years year".split(
    " ",
  ),
);

/** Different spellings of the same technology map to one token. */
const ALIASES: Record<string, string> = {
  postgres: "postgresql",
  psql: "postgresql",
  pg: "postgresql",
  js: "javascript",
  ts: "typescript",
  nextjs: "next.js",
  next: "next.js",
  node: "node.js",
  nodejs: "node.js",
  reactjs: "react",
  "react.js": "react",
  k8s: "kubernetes",
  llm: "llms",
  "gen-ai": "ai",
  genai: "ai",
  tailwindcss: "tailwind",
  restful: "rest",
};

/**
 * A heading is a short line in capitals, like "EXPERIENCE" or "SKILLS".
 * At least 4 letters and no list punctuation, so "CSS" or "AWS, GCP" on
 * their own line stay content.
 */
function isHeading(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  return (
    letters.length >= 4 &&
    line.length <= 40 &&
    line.split(/\s+/).length <= 4 &&
    letters === letters.toUpperCase() &&
    !/[,.;:/|&]/.test(line)
  );
}

const LONG_CHUNK = 280;
/** Fragments like "Lahore." or "2023 – now." join the previous piece. */
const SHORT_PIECE = 25;
const INLINE_BULLET = /\s*[•▪●◦]\s*/;
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z0-9])/;

/**
 * PDF text often has no bullets or blank lines, so a whole section arrives
 * as one block. Split long blocks at inline bullets and sentence ends,
 * merging tiny pieces back so each chunk is about one thing.
 */
function splitLong(text: string): string[] {
  if (text.length <= LONG_CHUNK) return [text];
  const pieces = text
    .split(INLINE_BULLET)
    .flatMap((part) => part.split(SENTENCE_END))
    .map((p) => p.trim())
    .filter(Boolean);

  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged.length - 1;
    if (
      last >= 0 &&
      (piece.length < SHORT_PIECE || merged[last].length < SHORT_PIECE)
    ) {
      merged[last] = `${merged[last]} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

/** Splits a CV into searchable chunks: each bullet, or each paragraph, with its section. */
export function chunkCv(cvText: string): CvChunk[] {
  const chunks: CvChunk[] = [];
  let section: string | null = null;
  let current: string[] = [];

  const flush = () => {
    const text = current.join(" ").replace(/\s+/g, " ").trim();
    for (const piece of text ? splitLong(text) : []) {
      chunks.push({ section, text: piece });
    }
    current = [];
  };

  for (const raw of cvText.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (isHeading(line)) {
      flush();
      section = line.replace(/\s+/g, " ");
      continue;
    }
    if (BULLET.test(line)) {
      flush();
      current.push(line.replace(BULLET, ""));
      continue;
    }
    current.push(line);
  }
  flush();
  return chunks;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => ALIASES[t] ?? t);
}

/** chunkCv, with each chunk's position in the CV. */
export function indexCv(cvText: string): IndexedChunk[] {
  return chunkCv(cvText).map((chunk, position) => ({ ...chunk, position }));
}

/**
 * Returns the chunks that best match a query, highest score first.
 * Score = distinct query words found, +2 if the whole phrase appears.
 */
export function searchChunks(
  chunks: IndexedChunk[],
  query: string,
  limit = 5,
): (IndexedChunk & { score: number })[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (!queryTokens.length) return [];
  const phrase = query.trim().toLowerCase();

  return chunks
    .map((chunk) => {
      const haystack = new Set(
        tokenize(`${chunk.section ?? ""} ${chunk.text}`),
      );
      let score = queryTokens.filter((t) => haystack.has(t)).length;
      if (
        score &&
        phrase.length > 2 &&
        chunk.text.toLowerCase().includes(phrase)
      ) {
        score += 2;
      }
      return { ...chunk, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Keyword search over CV text: the CV chunks that best match a query. */
export function searchCv(cvText: string, query: string, limit = 5): CvMatch[] {
  return searchChunks(indexCv(cvText), query, limit).map(
    ({ section, text, score }) => ({ section, text, score }),
  );
}
