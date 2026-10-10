import { performance } from "node:perf_hooks";
import { createApp } from "./app.ts";
import { ChatService } from "./chat.ts";
import { loadConfig } from "./config.ts";
import { openDatabase, readMeta } from "./db.ts";
import { DeepSeekClient } from "./deepseek.ts";
import { LocalEmbedder } from "./embeddings.ts";
import { GitaRepository } from "./repository.ts";
import { Retriever } from "./retrieval.ts";

const config = loadConfig();
const db = openDatabase(config.DB_PATH, { readOnly: true });

const meta = readMeta(db);
if (meta.embedding_model !== config.EMBEDDING_MODEL) {
  throw new Error(
    `The database was indexed with ${meta.embedding_model}, but EMBEDDING_MODEL is ${config.EMBEDDING_MODEL}. Run \`npm run setup\` again.`,
  );
}

const started = performance.now();
const embedder = await LocalEmbedder.load({
  model: config.EMBEDDING_MODEL,
  dtype: config.EMBEDDING_DTYPE,
  cacheDir: config.MODEL_CACHE_DIR,
});
console.log(
  `Local models ready in ${((performance.now() - started) / 1000).toFixed(1)}s`,
);

const repository = new GitaRepository(db);
const retriever = new Retriever(db, embedder, repository);
const chat = new ChatService({
  llm: new DeepSeekClient({
    apiKey: config.DEEPSEEK_API_KEY,
    baseUrl: config.DEEPSEEK_BASE_URL,
    model: config.DEEPSEEK_MODEL,
  }),
  retriever,
  repository,
  topK: config.RETRIEVAL_TOP_K,
  reasoningEffort: config.DEEPSEEK_REASONING_EFFORT,
  logger: console,
});

const app = createApp({
  repository,
  retriever,
  chat,
  allowedOrigins: config.WEB_ORIGIN.split(",").map((o) => o.trim()),
  chatRateLimit: config.CHAT_RATE_LIMIT,
});

const server = app.listen(config.PORT, () => {
  console.log(`Gita API listening on http://localhost:${config.PORT}`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
