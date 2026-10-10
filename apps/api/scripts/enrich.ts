// Generates search metadata for every verse with the LLM: a plain-English
// summary, themes, and questions people ask today that the verse answers.
// The output is committed (data/enrichment/verses.json) so `npm run setup`
// stays offline and reproducible. Re-run only when changing the prompt.
//
// Usage: npm run enrich -w api [-- --force]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadConfig, REPO_ROOT } from "../src/config.ts";
import { DeepSeekClient } from "../src/deepseek.ts";
import { cleanTranslation } from "../src/text.ts";

const OUTPUT = path.join(REPO_ROOT, "data/enrichment/verses.json");
const CONCURRENCY = 8;

const Enrichment = z.object({
  summary: z.string().min(10),
  themes: z.array(z.string().min(2)).min(2).max(8),
  questions: z.array(z.string().min(5)).min(2).max(6),
});
type Enrichment = z.infer<typeof Enrichment>;

interface SourceVerse {
  id: number;
  chapter_number: number;
  verse_number: number;
}
interface SourceTranslation {
  verse_id: number;
  authorName: string;
  description: string;
}
interface SourceChapter {
  chapter_number: number;
  name_translation: string;
  name_meaning: string;
}

const source = (name: string) =>
  JSON.parse(
    readFileSync(path.join(REPO_ROOT, "data/source", `${name}.json`), "utf8"),
  );
const verses = source("verse") as SourceVerse[];
const chapters = new Map(
  (source("chapters") as SourceChapter[]).map((c) => [c.chapter_number, c]),
);
const translations = Map.groupBy(
  (source("translation") as SourceTranslation[]).filter((t) =>
    ["Swami Sivananda", "Swami Gambirananda"].includes(t.authorName),
  ),
  (t) => t.verse_id,
);

const SYSTEM = `You help index the Bhagavad Gita so that people looking for guidance in modern life can find the right verse.
For the verse you are given, return a JSON object with:
- "summary": one sentence in plain modern English explaining what the verse says, in the context of the surrounding verses.
- "themes": 3 to 6 short themes or concepts the verse is about (for example "grief over death", "duty without attachment").
- "questions": 3 to 5 questions a person today might ask that this verse helps answer, in their own everyday words (for example "How do I stop worrying about results at work?"). For purely narrative verses, ask about the story instead.
Be faithful to the verse. Do not add teachings it does not contain.`;

function describe(id: number): string {
  return (translations.get(id) ?? [])
    .map((t) => `${t.authorName}: ${cleanTranslation(t.description)}`)
    .join("\n");
}

function promptFor(v: SourceVerse): string {
  const chapter = chapters.get(v.chapter_number);
  const previous = verses.find((x) => x.id === v.id - 1);
  const next = verses.find((x) => x.id === v.id + 1);
  return [
    `Chapter ${v.chapter_number}: ${chapter?.name_translation} (${chapter?.name_meaning})`,
    previous
      ? `Previous verse ${previous.chapter_number}.${previous.verse_number}:\n${describe(previous.id)}`
      : "",
    `VERSE TO INDEX ${v.chapter_number}.${v.verse_number}:\n${describe(v.id)}`,
    next
      ? `Next verse ${next.chapter_number}.${next.verse_number}:\n${describe(next.id)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const config = loadConfig();
const llm = new DeepSeekClient({
  apiKey: config.DEEPSEEK_API_KEY,
  baseUrl: config.DEEPSEEK_BASE_URL,
  model: config.DEEPSEEK_MODEL,
});

const existing: Record<string, Enrichment> =
  existsSync(OUTPUT) && !process.argv.includes("--force")
    ? JSON.parse(readFileSync(OUTPUT, "utf8"))
    : {};
const todo = verses.filter(
  (v) => !existing[`${v.chapter_number}.${v.verse_number}`],
);
console.log(`Enriching ${todo.length} of ${verses.length} verses...`);

async function enrich(v: SourceVerse): Promise<Enrichment> {
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = await llm.complete({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: promptFor(v) },
        ],
        reasoningEffort: "none",
        maxTokens: 600,
        json: true,
        timeoutMs: 60_000,
      });
      return Enrichment.parse(JSON.parse(raw));
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

let done = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let v = queue.shift(); v; v = queue.shift()) {
      existing[`${v.chapter_number}.${v.verse_number}`] = await enrich(v);
      process.stdout.write(`\r${++done}/${todo.length}`);
    }
  }),
);
process.stdout.write("\n");

// Write in canonical verse order for stable diffs.
const ordered = Object.fromEntries(
  verses.map((v) => {
    const ref = `${v.chapter_number}.${v.verse_number}`;
    return [ref, existing[ref]];
  }),
);
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT)}`);
