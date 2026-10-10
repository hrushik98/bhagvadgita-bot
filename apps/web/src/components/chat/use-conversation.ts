"use client";

import type {
  ChatMessage,
  TranslationTarget,
  VerseSummary,
} from "@gita/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  streamChat,
  streamTranslation,
} from "@/lib/chat-stream";
import { stopReadAloud } from "@/lib/read-aloud";

export type AnswerStatus =
  | "searching"
  | "thinking"
  | "writing"
  | "done"
  | "stopped"
  | "error";

export interface Turn {
  id: string;
  question: string;
  answer: string;
  sources: VerseSummary[];
  crisis: boolean;
  status: AnswerStatus;
  error?: string;
  /** Translations of the answer, kept so switching back and forth is instant. */
  translations?: Partial<Record<TranslationTarget, string>>;
  /** Which version of the answer is shown. */
  view?: "original" | TranslationTarget;
  /** The translation currently streaming in, if any. */
  translating?: TranslationTarget;
  translationError?: string;
}

const STORAGE_KEY = "gita-guide.conversation.v1";

function loadTurns(): Turn[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    // A reload mid-answer leaves a turn in progress; treat it as stopped.
    return turns.map((t) => {
      const turn: Turn = ["searching", "thinking", "writing"].includes(t.status)
        ? {
            ...t,
            status: t.answer ? "stopped" : "error",
            error: t.answer ? undefined : "Interrupted",
          }
        : t;
      return turn.translating
        ? withoutTranslation(turn, turn.translating)
        : turn;
    });
  } catch {
    return [];
  }
}

function saveTurns(turns: Turn[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(turns));
  } catch {
    // Storage may be unavailable (private mode, quota). The conversation still works.
  }
}

/** Drops a translation (for example one interrupted half way) and shows the original. */
function withoutTranslation(turn: Turn, target: TranslationTarget): Turn {
  const { [target]: _dropped, ...translations } = turn.translations ?? {};
  return {
    ...turn,
    translations,
    translating: undefined,
    view: turn.view === target ? "original" : turn.view,
  };
}

/** Earlier completed turns as API messages. */
function toHistory(turns: Turn[]): ChatMessage[] {
  return turns
    .filter((t) => t.answer && (t.status === "done" || t.status === "stopped"))
    .flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.answer },
    ]);
}

export function useConversation() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const translators = useRef(new Map<string, AbortController>());

  useEffect(() => {
    setTurns(loadTurns());
    setHydrated(true);
    const running = translators.current;
    return () => {
      controller.current?.abort();
      for (const abort of running.values()) abort.abort();
    };
  }, []);

  useEffect(() => {
    if (hydrated) saveTurns(turns);
  }, [turns, hydrated]);

  const update = useCallback(
    (id: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
      setTurns((all) =>
        all.map((t) =>
          t.id === id
            ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) }
            : t,
        ),
      );
    },
    [],
  );

  const run = useCallback(
    async (turn: Turn, history: ChatMessage[]) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      try {
        const messages = [
          ...history,
          { role: "user" as const, content: turn.question },
        ];
        for await (const event of streamChat(messages, abort.signal)) {
          switch (event.type) {
            case "notice":
              update(turn.id, { crisis: true });
              break;
            case "sources":
              update(turn.id, { sources: event.verses });
              break;
            case "thinking":
              update(turn.id, { status: "thinking" });
              break;
            case "delta":
              update(turn.id, (t) => ({
                status: "writing",
                answer: t.answer + event.text,
              }));
              break;
            case "done":
              update(turn.id, { status: "done" });
              break;
            case "error":
              update(turn.id, { status: "error", error: event.message });
              break;
          }
        }
      } catch (error) {
        if (abort.signal.aborted) {
          update(turn.id, (t) =>
            t.answer
              ? { status: "stopped" }
              : { status: "error", error: "Stopped" },
          );
        } else {
          update(turn.id, {
            status: "error",
            error:
              error instanceof ApiRequestError
                ? error.message
                : "Something went wrong. Please try again.",
          });
        }
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    [update],
  );

  const ask = useCallback(
    (question: string) => {
      const turn: Turn = {
        id: crypto.randomUUID(),
        question,
        answer: "",
        sources: [],
        crisis: false,
        status: "searching",
      };
      const history = toHistory(turns);
      setTurns((all) => [...all, turn]);
      void run(turn, history);
    },
    [turns, run],
  );

  const retry = useCallback(
    (id: string) => {
      const index = turns.findIndex((t) => t.id === id);
      const turn = turns[index];
      if (!turn) return;
      const reset: Turn = {
        ...turn,
        answer: "",
        sources: [],
        crisis: false,
        status: "searching",
        error: undefined,
      };
      setTurns((all) => [...all.slice(0, index), reset]);
      void run(reset, toHistory(turns.slice(0, index)));
    },
    [turns, run],
  );

  const translate = useCallback(
    async (id: string, target: TranslationTarget) => {
      const turn = turns.find((t) => t.id === id);
      if (!turn?.answer) return;
      if (turn.translations?.[target] && turn.translating !== target) {
        update(id, { view: target, translationError: undefined });
        return;
      }
      if (turn.translating) return;

      const abort = new AbortController();
      translators.current.set(id, abort);
      update(id, (t) => ({
        view: target,
        translating: target,
        translationError: undefined,
        translations: { ...t.translations, [target]: "" },
      }));
      try {
        for await (const event of streamTranslation(
          turn.answer,
          target,
          abort.signal,
        )) {
          if (event.type === "delta") {
            update(id, (t) => ({
              translations: {
                ...t.translations,
                [target]: (t.translations?.[target] ?? "") + event.text,
              },
            }));
          } else if (event.type === "error") {
            throw new ApiRequestError(event.message);
          }
        }
        update(id, { translating: undefined });
      } catch (error) {
        if (abort.signal.aborted) return;
        setTurns((all) =>
          all.map((t) =>
            t.id === id
              ? {
                  ...withoutTranslation(t, target),
                  translationError:
                    error instanceof ApiRequestError
                      ? error.message
                      : "The translation failed. Please try again.",
                }
              : t,
          ),
        );
      } finally {
        translators.current.delete(id);
      }
    },
    [turns, update],
  );

  const showOriginal = useCallback(
    (id: string) =>
      update(id, { view: "original", translationError: undefined }),
    [update],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const reset = useCallback(() => {
    controller.current?.abort();
    for (const abort of translators.current.values()) abort.abort();
    translators.current.clear();
    stopReadAloud();
    setTurns([]);
  }, []);

  const busy = turns.some((t) =>
    ["searching", "thinking", "writing"].includes(t.status),
  );

  return {
    turns,
    hydrated,
    busy,
    ask,
    retry,
    stop,
    reset,
    translate,
    showOriginal,
  };
}
