"use client";

import type { ChatMessage, VerseSummary } from "@gita/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatRequestError, streamChat } from "@/lib/chat-stream";

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
}

const STORAGE_KEY = "gita-guide.conversation.v1";

function loadTurns(): Turn[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const turns = raw ? (JSON.parse(raw) as Turn[]) : [];
    // A reload mid-answer leaves a turn in progress; treat it as stopped.
    return turns.map((t) =>
      ["searching", "thinking", "writing"].includes(t.status)
        ? {
            ...t,
            status: t.answer ? "stopped" : "error",
            error: t.answer ? undefined : "Interrupted",
          }
        : t,
    );
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

  useEffect(() => {
    setTurns(loadTurns());
    setHydrated(true);
    return () => controller.current?.abort();
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
              error instanceof ChatRequestError
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

  const stop = useCallback(() => controller.current?.abort(), []);

  const reset = useCallback(() => {
    controller.current?.abort();
    setTurns([]);
  }, []);

  const busy = turns.some((t) =>
    ["searching", "thinking", "writing"].includes(t.status),
  );

  return { turns, hydrated, busy, ask, retry, stop, reset };
}
