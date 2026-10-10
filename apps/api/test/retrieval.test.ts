import { describe, expect, it } from "vitest";
import { GitaRepository } from "../src/repository.ts";
import {
  parseVerseRefs,
  Retriever,
  reciprocalRankFusion,
  toFtsQuery,
} from "../src/retrieval.ts";
import { createFixtureDb, KeywordEmbedder } from "./fixtures.ts";

describe("parseVerseRefs", () => {
  it("finds dotted, colon and spelled-out references", () => {
    expect(
      parseVerseRefs(
        "What does 2.47 mean? And BG 18:66? Also chapter 6 verse 5",
      ),
    ).toEqual([
      { chapter: 2, verse: 47 },
      { chapter: 18, verse: 66 },
      { chapter: 6, verse: 5 },
    ]);
  });

  it("ignores numbers that cannot be verses", () => {
    expect(
      parseVerseRefs("I slept 3.5 hours, chapter 19 verse 2, version 20.1"),
    ).toEqual([{ chapter: 3, verse: 5 }]);
  });
});

describe("toFtsQuery", () => {
  it("quotes meaningful words and drops stopwords", () => {
    expect(toFtsQuery("How do I control my anger?")).toBe(
      '"control" OR "anger"',
    );
  });

  it("neutralises FTS syntax in user input", () => {
    expect(toFtsQuery('anger" OR NEAR(* -x')).toBe('"anger" OR "near"');
  });

  it("returns null when nothing is searchable", () => {
    expect(toFtsQuery("what is it?")).toBeNull();
  });
});

describe("reciprocalRankFusion", () => {
  it("rewards items ranked well in several lists", () => {
    expect(reciprocalRankFusion([[1, 2, 3], [3, 2], [2]])).toEqual([2, 3, 1]);
  });
});

describe("Retriever", () => {
  const db = createFixtureDb();
  const repository = new GitaRepository(db);

  it("fuses semantic and keyword results", async () => {
    const retriever = new Retriever(db, new KeywordEmbedder(), repository);
    const results = await retriever.search("Where does anger come from?", 2);
    expect(results[0]?.verse.ref).toBe("2.62");
  });

  it("puts explicitly referenced verses first", async () => {
    const retriever = new Retriever(db, new KeywordEmbedder(), repository);
    const results = await retriever.search("Explain 2.48 about anger", 3);
    expect(results.map((r) => r.verse.ref).slice(0, 2)).toEqual([
      "2.48",
      "2.62",
    ]);
  });

  it("searches every phrasing of the question", async () => {
    const embedder = new KeywordEmbedder();
    const retriever = new Retriever(db, embedder, repository);
    await retriever.search(["गुस्सा", "How do I control anger?", "गुस्सा"], 3);
    expect(embedder.queries).toEqual(["गुस्सा", "How do I control anger?"]);
  });
});
