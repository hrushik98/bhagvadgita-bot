import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const ENV_FILE = path.resolve(import.meta.dirname, "../.env");

const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list of origins allowed to call the API from a browser. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),

  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  /** Reasoning effort for answers. "none" disables thinking for the fastest replies. */
  DEEPSEEK_REASONING_EFFORT: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
    .default("low"),

  DB_PATH: z.string().default(path.join(REPO_ROOT, "data/gita.db")),
  MODEL_CACHE_DIR: z.string().default(path.join(REPO_ROOT, ".cache/models")),
  EMBEDDING_MODEL: z
    .string()
    .default("onnx-community/embeddinggemma-300m-ONNX"),
  EMBEDDING_DTYPE: z.enum(["fp32", "q8", "q4"]).default("fp32"),

  /** Number of verses retrieved as context for each answer. */
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
  /** Chat requests allowed per IP per minute. */
  CHAT_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Reads configuration from the environment. Values in apps/api/.env take
 * precedence over inherited shell variables, so a stale global export (for
 * example DEEPSEEK_API_KEY in ~/.zshrc) cannot silently override the project.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  envFile: string | null = ENV_FILE,
): Config {
  const fileEnv =
    envFile && existsSync(envFile)
      ? parseEnv(readFileSync(envFile, "utf8"))
      : {};
  const result = ConfigSchema.safeParse({ ...env, ...fileEnv });
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
