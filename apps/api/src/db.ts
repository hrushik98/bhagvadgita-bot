import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

export const EMBEDDING_DIMENSIONS = 768;

export function openDatabase(
  dbPath: string,
  options: { create?: boolean; readOnly?: boolean } = {},
): DatabaseSync {
  if (!options.create && !existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}. Run \`npm run setup\` from the repo root first.`,
    );
  }
  const db = new DatabaseSync(dbPath, {
    allowExtension: true,
    readOnly: options.readOnly ?? false,
  });
  sqliteVec.load(db);
  db.enableLoadExtension(false);
  return db;
}

export function createSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE chapters (
      number INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      transliterated_name TEXT NOT NULL,
      meaning TEXT NOT NULL,
      summary TEXT NOT NULL,
      summary_hindi TEXT NOT NULL,
      verse_count INTEGER NOT NULL
    );

    CREATE TABLE verses (
      id INTEGER PRIMARY KEY,
      chapter INTEGER NOT NULL REFERENCES chapters(number),
      verse INTEGER NOT NULL,
      sanskrit TEXT NOT NULL,
      transliteration TEXT NOT NULL,
      word_meanings TEXT NOT NULL,
      UNIQUE (chapter, verse)
    );

    CREATE TABLE translations (
      verse_id INTEGER NOT NULL REFERENCES verses(id),
      author TEXT NOT NULL,
      language TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      PRIMARY KEY (verse_id, author)
    );

    -- Keyword index (BM25). rowid = verses.id
    CREATE VIRTUAL TABLE verses_fts USING fts5(
      translations,
      transliteration,
      enrichment,
      tokenize = 'porter unicode61 remove_diacritics 2'
    );

    -- Semantic index over the translations themselves.
    CREATE VIRTUAL TABLE verse_embeddings USING vec0(
      verse_id INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}] distance_metric=cosine
    );

    -- Semantic index over LLM-written summaries, themes and everyday questions
    -- (data/enrichment/verses.json). Bridges modern phrasing and old translations.
    CREATE VIRTUAL TABLE verse_enrichment_embeddings USING vec0(
      verse_id INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}] distance_metric=cosine
    );
  `);
}

export function readMeta(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM meta").all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function toVectorBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}
