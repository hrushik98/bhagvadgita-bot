import type { DatabaseSync } from "node:sqlite";
import type { VerseRef, VerseSummary } from "@gita/shared";
import { toVectorBlob } from "./db.ts";
import type { Embedder } from "./embeddings.ts";
import type { GitaRepository } from "./repository.ts";

const CANDIDATES_PER_INDEX = 30;
/** Standard reciprocal rank fusion constant. */
const RRF_K = 60;

// Common words that only add noise to BM25 queries.
const STOPWORDS = new Set(
  `a an and are as at be but by can do does for from how i if in into is it its me my of on or
  so that the their them they this to was what when where which who why will with you your
  should would could about am have has had not no gita bhagavad krishna says say tell`.split(
    /\s+/,
  ),
);

export interface RetrievedVerse {
  id: number;
  verse: VerseSummary;
}

/** Hybrid retrieval: semantic vectors + BM25 keywords, fused with reciprocal rank fusion. */
export class Retriever {
  private readonly db: DatabaseSync;
  private readonly embedder: Embedder;
  private readonly repository: GitaRepository;

  constructor(
    db: DatabaseSync,
    embedder: Embedder,
    repository: GitaRepository,
  ) {
    this.db = db;
    this.embedder = embedder;
    this.repository = repository;
  }

  /**
   * Searches with one or more phrasings of the same question (for example the
   * person's own words and an English rewrite) and fuses all rankings.
   */
  async search(
    queries: string | string[],
    limit: number,
  ): Promise<RetrievedVerse[]> {
    const unique = [
      ...new Set(
        [queries]
          .flat()
          .map((q) => q.trim())
          .filter(Boolean),
      ),
    ];
    const explicit = unique
      .flatMap(parseVerseRefs)
      .map((ref) => this.repository.findVerseId(ref))
      .filter((id): id is number => id !== null);

    const rankings = (
      await Promise.all(
        unique.map(async (query) => {
          const vector = toVectorBlob(await this.embedder.embedQuery(query));
          return [
            this.vectorSearch("verse_embeddings", vector),
            this.vectorSearch("verse_enrichment_embeddings", vector),
            this.keywordSearch(query),
          ];
        }),
      )
    ).flat();
    const fused = reciprocalRankFusion(rankings);
    const ids = [...new Set([...explicit, ...fused])].slice(0, limit);

    return this.repository.getVerseSummariesByIds(ids);
  }

  private vectorSearch(
    table: "verse_embeddings" | "verse_enrichment_embeddings",
    vector: Uint8Array,
  ): number[] {
    const rows = this.db
      .prepare(
        `SELECT verse_id FROM ${table} WHERE embedding MATCH ? AND k = ? ORDER BY distance`,
      )
      .all(vector, CANDIDATES_PER_INDEX) as { verse_id: number }[];
    return rows.map((r) => r.verse_id);
  }

  private keywordSearch(query: string): number[] {
    const match = toFtsQuery(query);
    if (!match) return [];
    const rows = this.db
      .prepare(
        `SELECT rowid AS id FROM verses_fts WHERE verses_fts MATCH ?
         ORDER BY bm25(verses_fts, 1.0, 0.5, 0.75) LIMIT ?`,
      )
      .all(match, CANDIDATES_PER_INDEX) as { id: number }[];
    return rows.map((r) => r.id);
  }
}

export function reciprocalRankFusion(rankings: number[][]): number[] {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Builds a safe FTS5 query: each meaningful word quoted and OR-ed together. */
export function toFtsQuery(query: string): string | null {
  const terms = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (term) => term.length > 1 && !STOPWORDS.has(term) && !/^\d+$/.test(term),
  );
  const unique = [...new Set(terms)];
  return unique.length ? unique.map((t) => `"${t}"`).join(" OR ") : null;
}

/** Finds explicit references like "2.47", "BG 18:66" or "chapter 2 verse 47". */
export function parseVerseRefs(query: string): VerseRef[] {
  const refs: VerseRef[] = [];
  const patterns = [
    /\b(\d{1,2})\s*[.:]\s*(\d{1,2})\b/g,
    /\bchapter\s+(\d{1,2})\s*,?\s*(?:verse|shloka|sloka)\s+(\d{1,2})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const m of query.matchAll(pattern)) {
      const chapter = Number(m[1]);
      const verse = Number(m[2]);
      if (chapter >= 1 && chapter <= 18 && verse >= 1)
        refs.push({ chapter, verse });
    }
  }
  return refs;
}
