import type {
  ApiError,
  ChatEvent,
  SpeechResponse,
  TranslateEvent,
} from "@gita/shared";
import cors from "cors";
import express, { type ErrorRequestHandler, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import type { ChatService } from "./chat.ts";
import type { LlmClient } from "./deepseek.ts";
import type { GitaRepository } from "./repository.ts";
import type { Retriever } from "./retrieval.ts";
import { type SpeechService, SpeechUnavailableError } from "./speech.ts";
import { buildTranslationMessages } from "./translate.ts";

export interface AppDependencies {
  repository: GitaRepository;
  retriever: Retriever;
  chat: ChatService;
  llm: LlmClient;
  speech: SpeechService;
  allowedOrigins: string[];
  chatRateLimit: number;
  /** Per-IP limit per minute for translation and read-aloud, each. */
  toolsRateLimit: number;
  logger?: Pick<Console, "error">;
}

const ChapterParams = z.object({
  chapter: z.coerce.number().int().min(1).max(18),
});
const VerseParams = ChapterParams.extend({
  verse: z.coerce.number().int().min(1).max(100),
});
const SearchQuery = z.object({
  q: z.string().trim().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
const DateQuery = z.object({
  date: z.iso.date().optional(),
});
const ChatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40)
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "The last message must be from the user",
    })
    .refine((messages) => (messages.at(-1)?.content.length ?? 0) <= 2000, {
      message:
        "Your message is too long. Please keep it under 2000 characters.",
    }),
});

const TranslateBody = z.object({
  text: z.string().trim().min(1).max(8000),
  target: z.enum(["hindi", "telugu"]),
});
const SpeechBody = z.object({
  text: z.string().trim().min(1).max(8000),
});
const SpeechParams = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/, "Invalid audio id"),
});

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      400,
      result.error.issues[0]?.message ?? "Invalid request",
    );
  }
  return result.data;
}

/** Today's date in India, which is where most readers are. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

export function createApp(deps: AppDependencies): express.Express {
  const { repository, retriever, chat, llm, speech, logger = console } = deps;
  const limit = (perMinute: number, error: string) =>
    rateLimit({
      windowMs: 60_000,
      limit: perMinute,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error } satisfies ApiError,
    });
  const toolsLimit = (name: string) =>
    limit(
      deps.toolsRateLimit,
      `Too many ${name} requests. Please try again in a minute.`,
    );
  const app = express();

  app.disable("x-powered-by");
  // Requests arrive through local proxies: Docker's port mapping and the
  // Cloudflare tunnel. Trusting only local addresses lets req.ip (and so the
  // rate limits) use the real client IP from X-Forwarded-For.
  app.set("trust proxy", ["loopback", "uniquelocal"]);
  app.use(helmet());
  app.use(cors({ origin: deps.allowedOrigins }));
  app.use(express.json({ limit: "200kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/chapters", (_req, res) => {
    res.json(repository.listChapters());
  });

  app.get("/chapters/:chapter", (req, res) => {
    const { chapter } = parse(ChapterParams, req.params);
    const detail = repository.getChapter(chapter);
    if (!detail) throw new HttpError(404, "Chapter not found");
    res.json(detail);
  });

  app.get("/verses/:chapter/:verse", (req, res) => {
    const { chapter, verse } = parse(VerseParams, req.params);
    const detail = repository.getVerse(chapter, verse);
    if (!detail) throw new HttpError(404, "Verse not found");
    res.json(detail);
  });

  app.get("/verse-of-the-day", (req, res) => {
    const { date = todayInIndia() } = parse(DateQuery, req.query);
    const verse = repository.getVerseOfTheDay(date);
    if (!verse) throw new HttpError(404, "No verses available");
    res.json({ date, verse });
  });

  app.get("/search", async (req, res) => {
    const { q, limit } = parse(SearchQuery, req.query);
    const results = await retriever.search(q, limit);
    res.json({ query: q, verses: results.map((r) => r.verse) });
  });

  app.post(
    "/chat",
    limit(
      deps.chatRateLimit,
      "You're asking quickly. Please take a breath and try again in a minute.",
    ),
    async (req, res) => {
      const { messages } = parse(ChatBody, req.body);
      await streamEvents(res, (signal) => chat.answer(messages, signal), {
        errorMessage:
          "Something went wrong while preparing your answer. Please try again.",
        logger,
      });
    },
  );

  app.post("/translate", toolsLimit("translation"), async (req, res) => {
    const { text, target } = parse(TranslateBody, req.body);
    async function* translate(
      signal: AbortSignal,
    ): AsyncGenerator<TranslateEvent> {
      const chunks = llm.stream({
        messages: buildTranslationMessages(text, target),
        reasoningEffort: "none",
        maxTokens: 6000,
        signal,
      });
      for await (const chunk of chunks) {
        if (chunk.type === "content") yield { type: "delta", text: chunk.text };
      }
      yield { type: "done" };
    }
    await streamEvents(res, translate, {
      errorMessage: "The translation failed. Please try again.",
      logger,
    });
  });

  app.post("/speech", toolsLimit("read-aloud"), (req, res) => {
    const { text } = parse(SpeechBody, req.body);
    try {
      const { id, language } = speech.prepare(text);
      res.json({ url: `/speech/${id}.mp3`, language } satisfies SpeechResponse);
    } catch (error) {
      if (error instanceof SpeechUnavailableError)
        throw new HttpError(503, error.message);
      throw error;
    }
  });

  // Serves cached audio with range support, or streams it while it is generated
  // so playback starts before synthesis finishes.
  app.get("/speech/:id.mp3", async (req, res) => {
    const { id } = parse(SpeechParams, req.params);
    // Audio is fetched by an <audio> element on the web app's origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const pending = speech.waitForInflight(id);
    if (pending) await pending.catch(() => {});

    const cached = speech.cachedFile(id);
    if (cached) {
      // The cache lives under .cache/, which `send` would otherwise refuse as a dotfile path.
      res.sendFile(cached, {
        maxAge: "365d",
        immutable: true,
        dotfiles: "allow",
      });
      return;
    }
    if (!speech.hasJob(id))
      throw new HttpError(404, "This audio has expired. Please try again.");

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      for await (const chunk of speech.generate(id, controller.signal)) {
        if (!res.headersSent) {
          res.writeHead(200, {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          });
        }
        if (!res.write(chunk))
          await new Promise((resolve) => res.once("drain", resolve));
      }
      res.end();
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error("Speech synthesis failed", error);
      if (res.headersSent) res.destroy();
      else throw new HttpError(502, "Reading aloud failed. Please try again.");
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" } satisfies ApiError);
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res
        .status(error.status)
        .json({ error: error.message } satisfies ApiError);
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON body" } satisfies ApiError);
      return;
    }
    logger.error(error);
    res.status(500).json({ error: "Internal server error" } satisfies ApiError);
  };
  app.use(errorHandler);

  return app;
}

type StreamEvent = ChatEvent | TranslateEvent;

/** Streams events as server-sent events, stopping the work if the client disconnects. */
async function streamEvents(
  res: Response,
  produce: (signal: AbortSignal) => AsyncIterable<StreamEvent>,
  options: { errorMessage: string; logger: Pick<Console, "error"> },
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  const send = (event: StreamEvent) =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    for await (const event of produce(controller.signal)) send(event);
  } catch (error) {
    if (!controller.signal.aborted) {
      options.logger.error(error);
      send({ type: "error", message: options.errorMessage });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
