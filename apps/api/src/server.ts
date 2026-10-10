import { performance } from "node:perf_hooks";
import { createApp } from "./app.ts";
import { ChatService } from "./chat.ts";
import { loadConfig } from "./config.ts";
import { openDatabase, readMeta } from "./db.ts";
import { DeepSeekClient } from "./deepseek.ts";
import { LocalEmbedder } from "./embeddings.ts";
import { GitaRepository } from "./repository.ts";
import { Retriever } from "./retrieval.ts";
import { ElevenLabsTts, SarvamTts, SpeechService } from "./speech.ts";

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
const llm = new DeepSeekClient({
  apiKey: config.DEEPSEEK_API_KEY,
  baseUrl: config.DEEPSEEK_BASE_URL,
  model: config.DEEPSEEK_MODEL,
});
const chat = new ChatService({
  llm,
  retriever,
  repository,
  topK: config.RETRIEVAL_TOP_K,
  reasoningEffort: config.DEEPSEEK_REASONING_EFFORT,
  logger: console,
});

const sarvam = (languageCode: "hi-IN" | "te-IN") =>
  config.SARVAM_API_KEY
    ? new SarvamTts({
        apiKey: config.SARVAM_API_KEY,
        model: config.SARVAM_TTS_MODEL,
        speaker: config.SARVAM_SPEAKER,
        languageCode,
      })
    : null;
const speech = new SpeechService({
  cacheDir: config.SPEECH_CACHE_DIR,
  providers: {
    english: config.ELEVENLABS_API_KEY
      ? new ElevenLabsTts({
          apiKey: config.ELEVENLABS_API_KEY,
          model: config.ELEVENLABS_MODEL,
          voiceId: config.ELEVENLABS_VOICE_ID,
        })
      : null,
    hindi: sarvam("hi-IN"),
    telugu: sarvam("te-IN"),
  },
});

const app = createApp({
  repository,
  retriever,
  chat,
  llm,
  speech,
  toolsRateLimit: config.TOOLS_RATE_LIMIT,
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
