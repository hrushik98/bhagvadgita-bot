import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import type { SpeechLanguage } from "@gita/shared";

// Read-aloud: picks a voice by the script of the text, synthesises MP3 with
// the matching provider, and caches it on disk keyed by voice and text.

export interface TtsProvider {
  /** Identifies the voice; part of the cache key. */
  readonly id: string;
  /** Longest text sent in one request. Longer text is split at sentence boundaries. */
  readonly maxChars: number;
  stream(text: string, signal: AbortSignal): AsyncIterable<Uint8Array>;
}

export class SpeechUnavailableError extends Error {}
export class TtsProviderError extends Error {}

/** Hindi for Devanagari, Telugu for Telugu script, otherwise English (including Hinglish). */
export function detectSpeechLanguage(text: string): SpeechLanguage {
  const letters = text.match(/\p{Letter}/gu)?.length ?? 0;
  if (letters === 0) return "english";
  // Count letters only: vowel signs and viramas are marks, not letters.
  const telugu = text.match(/(?=\p{Script=Telugu})\p{Letter}/gu)?.length ?? 0;
  const devanagari =
    text.match(/(?=\p{Script=Devanagari})\p{Letter}/gu)?.length ?? 0;
  if (telugu / letters > 0.2) return "telugu";
  if (devanagari / letters > 0.2) return "hindi";
  return "english";
}

/** Turns an answer's Markdown into plain text worth hearing: no citations or markup. */
export function toSpeechText(markdown: string): string {
  return (
    markdown
      .replace(
        /\s*\[\s*(?:BG\s*)?\d{1,2}\.\d{1,2}(?:\s*[,;]\s*(?:BG\s*)?\d{1,2}\.\d{1,2})*\s*\]/gi,
        "",
      )
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // [ \t] rather than \s, so these never swallow the blank line between paragraphs.
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
      .replace(/^[ \t]*>[ \t]?/gm, "")
      .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
      .replace(/[ \t]+/g, " ")
      .replace(/ +([,.;:!?।])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Splits text into pieces of at most `maxChars`, breaking between sentences
 * where possible, then between words, and only cutting a word that is itself too long.
 */
export function splitForSpeech(text: string, maxChars: number): string[] {
  const units = text
    .split(/(?<=[.!?।॥])\s+|\n+/)
    .flatMap((sentence) =>
      sentence.length <= maxChars ? [sentence] : sentence.split(/\s+/),
    )
    .flatMap((unit) => {
      const parts: string[] = [];
      for (let start = 0; start < unit.length; start += maxChars)
        parts.push(unit.slice(start, start + maxChars));
      return parts;
    })
    .filter(Boolean);

  const pieces: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + 1 + unit.length > maxChars) {
      pieces.push(current);
      current = unit;
    } else {
      current = current ? `${current} ${unit}` : unit;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

async function* readBody(response: Response): AsyncIterable<Uint8Array> {
  if (!response.body) return;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    if (value) yield value;
  }
}

async function ensureOk(
  response: Response,
  provider: string,
): Promise<Response> {
  if (response.ok) return response;
  const detail = await response.text().catch(() => "");
  throw new TtsProviderError(
    `${provider} failed (${response.status}): ${detail.slice(0, 300)}`,
  );
}

export class ElevenLabsTts implements TtsProvider {
  readonly id: string;
  readonly maxChars = 5000;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voiceId: string;

  constructor(options: { apiKey: string; model: string; voiceId: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.voiceId = options.voiceId;
    this.id = `elevenlabs:${options.model}:${options.voiceId}`;
  }

  async *stream(text: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, model_id: this.model }),
        signal,
      },
    );
    yield* readBody(await ensureOk(response, "ElevenLabs"));
  }
}

export class SarvamTts implements TtsProvider {
  readonly id: string;
  // The streaming endpoint accepts 3500 characters; leave headroom.
  readonly maxChars = 3000;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly speaker: string;
  private readonly languageCode: string;

  constructor(options: {
    apiKey: string;
    model: string;
    speaker: string;
    languageCode: "hi-IN" | "te-IN";
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.speaker = options.speaker;
    this.languageCode = options.languageCode;
    this.id = `sarvam:${options.model}:${options.speaker}:${options.languageCode}`;
  }

  async *stream(text: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    const response = await fetch(
      "https://api.sarvam.ai/text-to-speech/stream",
      {
        method: "POST",
        headers: {
          "api-subscription-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          target_language_code: this.languageCode,
          speaker: this.speaker,
          model: this.model,
          output_audio_codec: "mp3",
        }),
        signal,
      },
    );
    yield* readBody(await ensureOk(response, "Sarvam"));
  }
}

interface SpeechJob {
  text: string;
  provider: TtsProvider;
  createdAt: number;
}

const JOB_TTL_MS = 30 * 60_000;
const MAX_TEXT_CHARS = 8000;

export class SpeechService {
  private readonly cacheDir: string;
  private readonly providers: Record<SpeechLanguage, TtsProvider | null>;
  private readonly jobs = new Map<string, SpeechJob>();
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(options: {
    cacheDir: string;
    providers: Record<SpeechLanguage, TtsProvider | null>;
  }) {
    this.cacheDir = path.resolve(options.cacheDir);
    this.providers = options.providers;
    mkdirSync(this.cacheDir, { recursive: true });
  }

  /** Registers text for synthesis and returns the id its audio will be served under. */
  prepare(markdown: string): { id: string; language: SpeechLanguage } {
    const text = toSpeechText(markdown).slice(0, MAX_TEXT_CHARS);
    if (!text)
      throw new SpeechUnavailableError("There is nothing to read aloud.");
    const language = detectSpeechLanguage(text);
    const provider = this.providers[language];
    if (!provider) {
      throw new SpeechUnavailableError(
        `Reading aloud in ${language} is not configured on the server.`,
      );
    }
    const id = createHash("sha256")
      .update(`${provider.id}\n${text}`)
      .digest("hex");
    this.pruneJobs();
    if (!this.cachedFile(id))
      this.jobs.set(id, { text, provider, createdAt: Date.now() });
    return { id, language };
  }

  cachedFile(id: string): string | null {
    const file = this.filePath(id);
    return existsSync(file) ? file : null;
  }

  /** Resolves when audio for `id` that is being generated right now is cached. */
  waitForInflight(id: string): Promise<void> | null {
    return this.inflight.get(id) ?? null;
  }

  hasJob(id: string): boolean {
    return this.jobs.has(id);
  }

  /**
   * Synthesises the audio for a prepared id, yielding MP3 bytes as they arrive
   * and caching the complete file. Partial audio is never cached.
   */
  async *generate(id: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    const job = this.jobs.get(id);
    if (!job)
      throw new SpeechUnavailableError(
        "This audio has expired. Please try again.",
      );

    let finish: () => void = () => {};
    let fail: (error: unknown) => void = () => {};
    const done = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    done.catch(() => {});
    this.inflight.set(id, done);

    const tmp = `${this.filePath(id)}.${process.pid}.${Date.now()}.tmp`;
    const file = createWriteStream(tmp);
    try {
      for (const piece of splitForSpeech(job.text, job.provider.maxChars)) {
        for await (const chunk of job.provider.stream(piece, signal)) {
          file.write(chunk);
          yield chunk;
        }
      }
      await new Promise<void>((resolve, reject) =>
        file.end((error?: Error | null) => (error ? reject(error) : resolve())),
      );
      renameSync(tmp, this.filePath(id));
      this.jobs.delete(id);
      finish();
    } catch (error) {
      file.destroy();
      rmSync(tmp, { force: true });
      fail(error);
      throw error;
    } finally {
      this.inflight.delete(id);
    }
  }

  private filePath(id: string): string {
    return path.join(this.cacheDir, `${id}.mp3`);
  }

  private pruneJobs(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.jobs)
      if (job.createdAt < cutoff) this.jobs.delete(id);
  }
}
