// Builds data/gita.db from the vendored gita/gita dataset in data/source and
// the committed verse enrichment in data/enrichment: relational tables, an FTS5
// keyword index and local vector embeddings. Runs fully offline once the
// embedding model is cached.
//
// Usage: npm run setup (from the repo root)

import { readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadConfig, REPO_ROOT } from "../src/config.ts";
import {
  createSchema,
  EMBEDDING_DIMENSIONS,
  openDatabase,
  toVectorBlob,
} from "../src/db.ts";
import { type EmbeddingDocument, LocalEmbedder } from "../src/embeddings.ts";
import { cleanTranslation, cleanVerseLines } from "../src/text.ts";
import {
  EMBEDDED_TRANSLATORS,
  PRIMARY_TRANSLATORS,
  TRANSLATOR_ORDER,
} from "../src/translators.ts";

interface SourceChapter {
  chapter_number: number;
  name: string;
  name_transliterated: string;
  name_translation: string;
  name_meaning: string;
  chapter_summary: string;
  chapter_summary_hindi: string;
  verses_count: number;
}

interface SourceVerse {
  id: number;
  chapter_number: number;
  verse_number: number;
  text: string;
  transliteration: string;
  word_meanings: string;
}

interface SourceTranslation {
  verse_id: number;
  authorName: string;
  lang: "english" | "hindi";
  description: string;
}

const BATCH_SIZE = 16;
const SOURCE_DIR = path.join(REPO_ROOT, "data/source");

function readSource<T>(name: string): T {
  return JSON.parse(
    readFileSync(path.join(SOURCE_DIR, `${name}.json`), "utf8"),
  ) as T;
}

const config = loadConfig();
const chapters = readSource<SourceChapter[]>("chapters");
const verses = readSource<SourceVerse[]>("verse");
const translations = readSource<SourceTranslation[]>("translation").filter(
  (t) => TRANSLATOR_ORDER.includes(t.authorName),
);

const enrichment = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "data/enrichment/verses.json"), "utf8"),
) as Record<string, { summary: string; themes: string[]; questions: string[] }>;

const chapterByNumber = new Map(chapters.map((c) => [c.chapter_number, c]));
const translationsByVerse = Map.groupBy(translations, (t) => t.verse_id);

console.log(
  `Loading embedding model ${config.EMBEDDING_MODEL} (${config.EMBEDDING_DTYPE})...`,
);
console.log("The first run downloads the model into .cache/models.");
const embedder = await LocalEmbedder.load({
  model: config.EMBEDDING_MODEL,
  dtype: config.EMBEDDING_DTYPE,
  cacheDir: config.MODEL_CACHE_DIR,
});

// Build into a temp file and swap it in, so a failed run never leaves a broken DB.
const tmpPath = `${config.DB_PATH}.tmp`;
for (const suffix of ["", "-wal", "-shm"])
  rmSync(tmpPath + suffix, { force: true });
const db = openDatabase(tmpPath, { create: true });
createSchema(db);

db.exec("BEGIN");
const insertChapter = db.prepare(
  `INSERT INTO chapters (number, name, transliterated_name, meaning, summary, summary_hindi, verse_count)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
for (const c of chapters) {
  insertChapter.run(
    c.chapter_number,
    c.name.trim(),
    c.name_translation.trim(),
    c.name_meaning.trim(),
    c.chapter_summary.trim(),
    c.chapter_summary_hindi.trim(),
    c.verses_count,
  );
}

const insertVerse = db.prepare(
  `INSERT INTO verses (id, chapter, verse, sanskrit, transliteration, word_meanings)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const insertTranslation = db.prepare(
  `INSERT INTO translations (verse_id, author, language, is_primary, text) VALUES (?, ?, ?, ?, ?)`,
);
const insertFts = db.prepare(
  "INSERT INTO verses_fts (rowid, translations, transliteration, enrichment) VALUES (?, ?, ?, ?)",
);

const documents: {
  verseId: number;
  translation: EmbeddingDocument;
  enrichment: EmbeddingDocument;
}[] = [];

for (const v of verses) {
  const chapter = chapterByNumber.get(v.chapter_number);
  if (!chapter)
    throw new Error(
      `Verse ${v.id} references unknown chapter ${v.chapter_number}`,
    );

  insertVerse.run(
    v.id,
    v.chapter_number,
    v.verse_number,
    cleanVerseLines(v.text),
    cleanVerseLines(v.transliteration),
    v.word_meanings.trim(),
  );

  const verseTranslations = (translationsByVerse.get(v.id) ?? []).map((t) => ({
    author: t.authorName,
    language: t.lang,
    text: cleanTranslation(t.description),
  }));
  for (const t of verseTranslations) {
    const isPrimary = PRIMARY_TRANSLATORS[t.language] === t.author ? 1 : 0;
    insertTranslation.run(v.id, t.author, t.language, isPrimary, t.text);
  }

  const english = verseTranslations.filter((t) =>
    EMBEDDED_TRANSLATORS.includes(t.author),
  );
  if (english.length === 0)
    throw new Error(`Verse ${v.id} has no English translation`);
  const englishText = english.map((t) => t.text).join("\n");

  const ref = `${v.chapter_number}.${v.verse_number}`;
  const extra = enrichment[ref];
  if (!extra)
    throw new Error(
      `Missing enrichment for ${ref}. Run \`npm run enrich -w api\`.`,
    );
  const enrichmentText = [
    extra.summary,
    extra.themes.join("; "),
    ...extra.questions,
  ].join("\n");

  insertFts.run(
    v.id,
    englishText,
    cleanVerseLines(v.transliteration),
    enrichmentText,
  );
  const title = `Bhagavad Gita ${ref}, ${chapter.name_translation.trim()}`;
  documents.push({
    verseId: v.id,
    translation: { title, text: englishText },
    enrichment: { title, text: enrichmentText },
  });
}

const insertEmbedding = db.prepare(
  "INSERT INTO verse_embeddings (verse_id, embedding) VALUES (?, ?)",
);
const insertEnrichmentEmbedding = db.prepare(
  "INSERT INTO verse_enrichment_embeddings (verse_id, embedding) VALUES (?, ?)",
);
const started = performance.now();
for (let i = 0; i < documents.length; i += BATCH_SIZE) {
  const batch = documents.slice(i, i + BATCH_SIZE);
  const vectors = await embedder.embedDocuments(
    batch.map((b) => b.translation),
  );
  const enrichmentVectors = await embedder.embedDocuments(
    batch.map((b) => b.enrichment),
  );
  batch.forEach((b, j) => {
    const vector = vectors[j];
    const enrichmentVector = enrichmentVectors[j];
    if (!vector || !enrichmentVector)
      throw new Error(`Missing embedding for verse ${b.verseId}`);
    insertEmbedding.run(BigInt(b.verseId), toVectorBlob(vector));
    insertEnrichmentEmbedding.run(
      BigInt(b.verseId),
      toVectorBlob(enrichmentVector),
    );
  });
  process.stdout.write(
    `\rEmbedding verses ${Math.min(i + BATCH_SIZE, documents.length)}/${documents.length}`,
  );
}
process.stdout.write("\n");

const insertMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
insertMeta.run("embedding_model", config.EMBEDDING_MODEL);
insertMeta.run("embedding_dtype", config.EMBEDDING_DTYPE);
insertMeta.run("embedding_dimensions", String(EMBEDDING_DIMENSIONS));
insertMeta.run("created_at", new Date().toISOString());
db.exec("COMMIT");
db.exec(
  "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE; VACUUM;",
);
db.close();

for (const suffix of ["-wal", "-shm"])
  rmSync(config.DB_PATH + suffix, { force: true });
renameSync(tmpPath, config.DB_PATH);

console.log(
  `Indexed ${chapters.length} chapters and ${verses.length} verses in ${((performance.now() - started) / 1000).toFixed(1)}s -> ${path.relative(REPO_ROOT, config.DB_PATH)}`,
);
