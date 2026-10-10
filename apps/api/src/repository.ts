import type { DatabaseSync } from "node:sqlite";
import type {
  Chapter,
  ChapterDetail,
  Language,
  Translation,
  Verse,
  VerseRef,
  VerseSummary,
} from "@gita/shared";
import { TRANSLATOR_ORDER } from "./translators.ts";

interface ChapterRow {
  number: number;
  name: string;
  transliterated_name: string;
  meaning: string;
  summary: string;
  summary_hindi: string;
  verse_count: number;
}

interface VerseSummaryRow {
  id: number;
  chapter: number;
  verse: number;
  sanskrit: string;
  transliteration: string;
  translation: string;
}

const VERSE_SUMMARY_SELECT = `
  SELECT v.id, v.chapter, v.verse, v.sanskrit, v.transliteration, t.text AS translation
  FROM verses v
  JOIN translations t ON t.verse_id = v.id AND t.language = 'english' AND t.is_primary = 1
`;

function toChapter(row: ChapterRow): Chapter {
  return {
    number: row.number,
    name: row.name,
    transliteratedName: row.transliterated_name,
    meaning: row.meaning,
    summary: row.summary,
    summaryHindi: row.summary_hindi,
    verseCount: row.verse_count,
  };
}

function toVerseSummary(row: VerseSummaryRow): VerseSummary {
  return {
    chapter: row.chapter,
    verse: row.verse,
    ref: `${row.chapter}.${row.verse}`,
    sanskrit: row.sanskrit,
    transliteration: row.transliteration,
    translation: row.translation,
  };
}

/** Read-only access to the scripture data in SQLite. */
export class GitaRepository {
  private readonly db: DatabaseSync;
  private readonly verseCount: number;

  constructor(db: DatabaseSync) {
    this.db = db;
    const row = db.prepare("SELECT COUNT(*) AS n FROM verses").get() as {
      n: number;
    };
    this.verseCount = row.n;
  }

  listChapters(): Chapter[] {
    const rows = this.db
      .prepare("SELECT * FROM chapters ORDER BY number")
      .all();
    return (rows as unknown as ChapterRow[]).map(toChapter);
  }

  getChapter(number: number): ChapterDetail | null {
    const row = this.db
      .prepare("SELECT * FROM chapters WHERE number = ?")
      .get(number);
    if (!row) return null;
    const verses = this.db
      .prepare(`${VERSE_SUMMARY_SELECT} WHERE v.chapter = ? ORDER BY v.verse`)
      .all(number) as unknown as VerseSummaryRow[];
    return {
      ...toChapter(row as unknown as ChapterRow),
      verses: verses.map(toVerseSummary),
    };
  }

  getVerse(chapter: number, verse: number): Verse | null {
    const row = this.db
      .prepare(
        `SELECT v.*, c.transliterated_name AS chapter_name FROM verses v
         JOIN chapters c ON c.number = v.chapter
         WHERE v.chapter = ? AND v.verse = ?`,
      )
      .get(chapter, verse) as
      | {
          id: number;
          sanskrit: string;
          transliteration: string;
          word_meanings: string;
          chapter_name: string;
        }
      | undefined;
    if (!row) return null;

    const translations = (
      this.db
        .prepare(
          "SELECT author, language, text FROM translations WHERE verse_id = ?",
        )
        .all(row.id) as unknown as Translation[]
    ).sort(
      (a, b) =>
        TRANSLATOR_ORDER.indexOf(a.author) - TRANSLATOR_ORDER.indexOf(b.author),
    );

    const primary = translations.find((t) => t.language === "english");
    return {
      chapter,
      verse,
      ref: `${chapter}.${verse}`,
      chapterName: row.chapter_name,
      sanskrit: row.sanskrit,
      transliteration: row.transliteration,
      translation: primary?.text ?? "",
      wordMeanings: row.word_meanings,
      translations,
      previous: this.neighbour(row.id - 1),
      next: this.neighbour(row.id + 1),
    };
  }

  /** Verse summaries for the given verse ids, in the same order. Unknown ids are skipped. */
  getVerseSummariesByIds(ids: number[]): { id: number; verse: VerseSummary }[] {
    if (ids.length === 0) return [];
    const rows = this.db
      .prepare(
        `${VERSE_SUMMARY_SELECT} WHERE v.id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids) as unknown as VerseSummaryRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id, verse: toVerseSummary(row) }] : [];
    });
  }

  findVerseId(ref: VerseRef): number | null {
    const row = this.db
      .prepare("SELECT id FROM verses WHERE chapter = ? AND verse = ?")
      .get(ref.chapter, ref.verse) as { id: number } | undefined;
    return row?.id ?? null;
  }

  /** Full context for the model: all English translations, plus the primary Hindi one. */
  getTranslationsForPrompt(
    ids: number[],
  ): Map<number, { author: string; language: Language; text: string }[]> {
    const result = new Map<number, Translation[]>();
    if (ids.length === 0) return result;
    const rows = this.db
      .prepare(
        `SELECT verse_id, author, language, text FROM translations
         WHERE verse_id IN (${ids.map(() => "?").join(",")})
           AND (language = 'english' OR is_primary = 1)`,
      )
      .all(...ids) as unknown as (Translation & { verse_id: number })[];
    for (const row of rows) {
      const list = result.get(row.verse_id) ?? [];
      list.push({ author: row.author, language: row.language, text: row.text });
      result.set(row.verse_id, list);
    }
    for (const list of result.values()) {
      list.sort(
        (a, b) =>
          TRANSLATOR_ORDER.indexOf(a.author) -
          TRANSLATOR_ORDER.indexOf(b.author),
      );
    }
    return result;
  }

  /**
   * A stable verse for a given calendar day. Chapter 1 is skipped because it is
   * mostly the battlefield setting rather than teaching.
   */
  getVerseOfTheDay(date: string): Verse | null {
    const candidates = this.db
      .prepare(
        "SELECT chapter, verse FROM verses WHERE chapter > 1 ORDER BY id",
      )
      .all() as unknown as VerseRef[];
    if (candidates.length === 0) return null;
    const pick = candidates[hashString(date) % candidates.length];
    return pick ? this.getVerse(pick.chapter, pick.verse) : null;
  }

  private neighbour(id: number): VerseRef | null {
    if (id < 1 || id > this.verseCount) return null;
    const row = this.db
      .prepare("SELECT chapter, verse FROM verses WHERE id = ?")
      .get(id);
    return (row as unknown as VerseRef | undefined) ?? null;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
