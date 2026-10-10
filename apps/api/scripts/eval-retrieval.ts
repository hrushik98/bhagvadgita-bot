// Measures retrieval quality on a hand-labelled question set.
//
// Usage: npm run eval              (raw questions only)
//        npm run eval -- --rewrite   (raw question fused with an LLM rewrite, as in chat)

import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { DeepSeekClient } from "../src/deepseek.ts";
import { LocalEmbedder } from "../src/embeddings.ts";
import { buildSearchQueryMessages } from "../src/prompts.ts";
import { GitaRepository } from "../src/repository.ts";
import { Retriever } from "../src/retrieval.ts";

interface EvalCase {
  question: string;
  expected: string[];
}

const cases = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "eval-cases.json"), "utf8"),
) as EvalCase[];
const rewrite = process.argv.includes("--rewrite");

const config = loadConfig();
const db = openDatabase(config.DB_PATH, { readOnly: true });
const embedder = await LocalEmbedder.load({
  model: config.EMBEDDING_MODEL,
  dtype: config.EMBEDDING_DTYPE,
  cacheDir: config.MODEL_CACHE_DIR,
});
const repository = new GitaRepository(db);
const retriever = new Retriever(db, embedder, repository);
const llm = rewrite
  ? new DeepSeekClient({
      apiKey: config.DEEPSEEK_API_KEY,
      baseUrl: config.DEEPSEEK_BASE_URL,
      model: config.DEEPSEEK_MODEL,
    })
  : null;

const k = config.RETRIEVAL_TOP_K;
let hits = 0;
let reciprocalRankSum = 0;

const started = performance.now();
for (const c of cases) {
  const rewritten = llm
    ? await llm.complete({
        messages: buildSearchQueryMessages([], c.question),
        reasoningEffort: "none",
        maxTokens: 120,
      })
    : null;
  const queries = rewritten ? [c.question, rewritten] : [c.question];
  const refs = (await retriever.search(queries, k)).map((r) => r.verse.ref);
  const rank = refs.findIndex((ref) => c.expected.includes(ref));
  if (rank >= 0) {
    hits++;
    reciprocalRankSum += 1 / (rank + 1);
  }
  const mark = rank >= 0 ? `hit@${rank + 1}` : "MISS ";
  console.log(
    `${mark.padEnd(6)} ${c.question.slice(0, 70).padEnd(70)} -> ${refs.join(", ")}`,
  );
  if (rewritten && rewritten !== c.question)
    console.log(`       rewrite: ${rewritten}`);
}

console.log(
  `\nAverage retrieval time: ${((performance.now() - started) / cases.length).toFixed(0)}ms per question`,
);
console.log(
  `\nHit rate@${k}: ${((hits / cases.length) * 100).toFixed(0)}% (${hits}/${cases.length})   MRR: ${(reciprocalRankSum / cases.length).toFixed(3)}`,
);
