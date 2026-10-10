import type { ApiError, ChatEvent } from "@gita/shared";
import cors from "cors";
import express, { type ErrorRequestHandler, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import type { ChatService } from "./chat.ts";
import type { GitaRepository } from "./repository.ts";
import type { Retriever } from "./retrieval.ts";

export interface AppDependencies {
  repository: GitaRepository;
  retriever: Retriever;
  chat: ChatService;
  allowedOrigins: string[];
  chatRateLimit: number;
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
  const { repository, retriever, chat, logger = console } = deps;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
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
    rateLimit({
      windowMs: 60_000,
      limit: deps.chatRateLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error:
          "You're asking quickly. Please take a breath and try again in a minute.",
      },
    }),
    async (req, res) => {
      const { messages } = parse(ChatBody, req.body);

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

      try {
        for await (const event of chat.answer(messages, controller.signal)) {
          sendEvent(res, event);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error("Chat failed", error);
          sendEvent(res, {
            type: "error",
            message:
              "Something went wrong while preparing your answer. Please try again.",
          });
        }
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
    },
  );

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

function sendEvent(res: Response, event: ChatEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
