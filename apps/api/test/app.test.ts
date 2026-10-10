import type { AddressInfo } from "node:net";
import type {
  Chapter,
  ChapterDetail,
  ChatEvent,
  SearchResponse,
  Verse,
} from "@gita/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { ChatService } from "../src/chat.ts";
import { GitaRepository } from "../src/repository.ts";
import { Retriever } from "../src/retrieval.ts";
import { createFixtureDb, FakeLlm, KeywordEmbedder } from "./fixtures.ts";

async function startServer(chatRateLimit: number) {
  const db = createFixtureDb();
  const repository = new GitaRepository(db);
  const retriever = new Retriever(db, new KeywordEmbedder(), repository);
  const app = createApp({
    repository,
    retriever,
    chat: new ChatService({
      llm: new FakeLlm(),
      retriever,
      repository,
      topK: 3,
      reasoningEffort: "low",
    }),
    allowedOrigins: ["http://localhost:3000"],
    chatRateLimit,
    logger: { error: () => {} },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => server.close(),
  };
}

let baseUrl = "";
let close: () => void = () => {};

beforeAll(async () => {
  ({ url: baseUrl, close } = await startServer(100));
});

afterAll(() => close());

const get = (path: string) => fetch(baseUrl + path);
const getJson = async <T>(path: string) =>
  (await (await get(path)).json()) as T;
const postChat = (body: unknown, url = baseUrl) =>
  fetch(`${url}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("reading endpoints", () => {
  it("lists chapters", async () => {
    const chapters = await getJson<Chapter[]>("/chapters");
    expect(chapters.map((c) => c.transliteratedName)).toEqual([
      "Arjuna Visada Yoga",
      "Sankhya Yoga",
    ]);
  });

  it("returns a chapter with its verses", async () => {
    const chapter = await getJson<ChapterDetail>("/chapters/2");
    expect(chapter.verses.map((v) => v.ref)).toEqual(["2.47", "2.48", "2.62"]);
  });

  it("returns a verse with translations and neighbours", async () => {
    const verse = await getJson<Verse>("/verses/2/48");
    expect(verse).toMatchObject({
      ref: "2.48",
      chapterName: "Sankhya Yoga",
      translation: "Perform action with an even mind in success and failure.",
      previous: { chapter: 2, verse: 47 },
      next: { chapter: 2, verse: 62 },
    });
    expect(verse.translations.map((t) => t.language)).toEqual([
      "english",
      "hindi",
    ]);
  });

  it("returns a stable verse of the day for a date", async () => {
    const a = await getJson<{ date: string; verse: Verse }>(
      "/verse-of-the-day?date=2026-10-10",
    );
    const b = await getJson<{ date: string; verse: Verse }>(
      "/verse-of-the-day?date=2026-10-10",
    );
    expect(a).toEqual(b);
    expect(a.verse.chapter).toBeGreaterThan(1);
  });

  it("404s unknown verses and 400s invalid ones", async () => {
    expect((await get("/verses/2/99")).status).toBe(404);
    expect((await get("/verses/19/1")).status).toBe(400);
    expect((await get("/chapters/abc")).status).toBe(400);
    expect((await get("/nope")).status).toBe(404);
  });

  it("searches", async () => {
    const result = await getJson<SearchResponse>("/search?q=anger&limit=2");
    expect(result.verses[0]?.ref).toBe("2.62");
  });
});

describe("POST /chat", () => {
  it("streams events as server-sent events", async () => {
    const response = await postChat({
      messages: [{ role: "user", content: "How should I work?" }],
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    const events = body
      .split("\n\n")
      .filter((frame) => frame.startsWith("data:"))
      .map((frame) => JSON.parse(frame.slice(5)) as ChatEvent);
    expect(events.map((e) => e.type)).toEqual([
      "sources",
      "thinking",
      "delta",
      "delta",
      "done",
    ]);
  });

  it("rejects invalid requests", async () => {
    expect((await postChat("{bad json")).status).toBe(400);
    expect((await postChat({ messages: [] })).status).toBe(400);
    expect(
      (await postChat({ messages: [{ role: "assistant", content: "hi" }] }))
        .status,
    ).toBe(400);
    const tooLong = await postChat({
      messages: [{ role: "user", content: "x".repeat(2001) }],
    });
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { error: string }).error).toMatch(
      /under 2000 characters/,
    );
  });

  it("rate limits per client", async () => {
    const limited = await startServer(2);
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await postChat(
        { messages: [{ role: "user", content: "hello" }] },
        limited.url,
      );
      await response.text();
      statuses.push(response.status);
    }
    limited.close();
    expect(statuses).toEqual([200, 200, 429]);
  });
});
