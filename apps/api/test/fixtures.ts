import type { DatabaseSync } from "node:sqlite";
import type { ChatEvent } from "@gita/shared";
import {
  createSchema,
  EMBEDDING_DIMENSIONS,
  openDatabase,
  toVectorBlob,
} from "../src/db.ts";
import type {
  CompletionOptions,
  LlmClient,
  StreamChunk,
} from "../src/deepseek.ts";
import type { Embedder } from "../src/embeddings.ts";
import type { TtsProvider } from "../src/speech.ts";

interface FixtureVerse {
  id: number;
  chapter: number;
  verse: number;
  english: string;
  hindi: string;
  /** Index of the one-hot embedding dimension standing in for this verse's topic. */
  topic: number;
}

export const FIXTURE_VERSES: FixtureVerse[] = [
  {
    id: 1,
    chapter: 1,
    verse: 1,
    english: "Dhritarashtra asked Sanjaya what happened at Kurukshetra.",
    hindi: "धृतराष्ट्र बोले।",
    topic: 0,
  },
  {
    id: 2,
    chapter: 2,
    verse: 47,
    english: "Your right is only to work, but not to its results.",
    hindi: "कर्तव्य-कर्म करनेमें ही तेरा अधिकार है।",
    topic: 1,
  },
  {
    id: 3,
    chapter: 2,
    verse: 48,
    english: "Perform action with an even mind in success and failure.",
    hindi: "सिद्धि-असिद्धिमें सम होकर कर्म कर।",
    topic: 1,
  },
  {
    id: 4,
    chapter: 2,
    verse: 62,
    english: "From attachment desire is born, and from desire anger arises.",
    hindi: "कामनासे क्रोध पैदा होता है।",
    topic: 2,
  },
];

export function oneHot(index: number): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMENSIONS);
  vector[index] = 1;
  return vector;
}

/** An in-memory database with the real schema and a few verses. */
export function createFixtureDb(): DatabaseSync {
  const db = openDatabase(":memory:", { create: true });
  createSchema(db);
  db.prepare(
    "INSERT INTO chapters VALUES (1, 'अर्जुनविषादयोग', 'Arjuna Visada Yoga', 'Arjuna''s Dilemma', 'Summary one', 'सार', 1)",
  ).run();
  db.prepare(
    "INSERT INTO chapters VALUES (2, 'सांख्ययोग', 'Sankhya Yoga', 'Transcendental Knowledge', 'Summary two', 'सार', 3)",
  ).run();
  for (const v of FIXTURE_VERSES) {
    db.prepare("INSERT INTO verses VALUES (?, ?, ?, ?, ?, ?)").run(
      v.id,
      v.chapter,
      v.verse,
      `संस्कृत ${v.chapter}.${v.verse}`,
      `transliteration ${v.chapter}.${v.verse}`,
      "word—meaning",
    );
    db.prepare(
      "INSERT INTO translations VALUES (?, 'Swami Sivananda', 'english', 1, ?)",
    ).run(v.id, v.english);
    db.prepare(
      "INSERT INTO translations VALUES (?, 'Swami Ramsukhdas', 'hindi', 1, ?)",
    ).run(v.id, v.hindi);
    db.prepare(
      "INSERT INTO verses_fts (rowid, translations, transliteration, enrichment) VALUES (?, ?, '', '')",
    ).run(v.id, v.english);
    for (const table of ["verse_embeddings", "verse_enrichment_embeddings"]) {
      db.prepare(
        `INSERT INTO ${table} (verse_id, embedding) VALUES (?, ?)`,
      ).run(BigInt(v.id), toVectorBlob(oneHot(v.topic)));
    }
  }
  return db;
}

/** Maps queries to a topic by keyword, standing in for the real model. */
export class KeywordEmbedder implements Embedder {
  readonly queries: string[] = [];

  async embedQuery(query: string): Promise<Float32Array> {
    this.queries.push(query);
    if (/anger|angry|gussa/i.test(query)) return oneHot(2);
    if (/work|result|duty/i.test(query)) return oneHot(1);
    return oneHot(0);
  }
}

export class FakeLlm implements LlmClient {
  readonly streamCalls: CompletionOptions[] = [];
  readonly completeCalls: CompletionOptions[] = [];
  chunks: StreamChunk[] = [
    { type: "reasoning", text: "thinking..." },
    { type: "content", text: "Act without attachment " },
    { type: "content", text: "[2.47]." },
  ];
  rewrite: string | Error = "How do I handle anger at work?";

  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk> {
    this.streamCalls.push(options);
    yield* this.chunks;
  }

  async complete(options: CompletionOptions): Promise<string> {
    this.completeCalls.push(options);
    if (this.rewrite instanceof Error) throw this.rewrite;
    return this.rewrite;
  }
}

export async function collect(
  events: AsyncGenerator<ChatEvent>,
): Promise<ChatEvent[]> {
  const all: ChatEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

export class FakeTts implements TtsProvider {
  readonly maxChars: number;
  readonly calls: string[] = [];
  readonly id: string;
  fail = false;

  constructor(id = "fake", maxChars = 1000) {
    this.id = id;
    this.maxChars = maxChars;
  }

  async *stream(text: string): AsyncIterable<Uint8Array> {
    this.calls.push(text);
    yield new TextEncoder().encode(`<${text.slice(0, 5)}`);
    if (this.fail) throw new Error("provider down");
    yield new TextEncoder().encode(">");
  }
}
