"use client";

import { Answer } from "./answer";
import { CrisisCard } from "./crisis-card";
import { Sources } from "./sources";
import type { Turn } from "./use-conversation";

const STATUS_TEXT: Partial<Record<Turn["status"], string>> = {
  searching: "Searching the verses",
  thinking: "Reflecting on what they teach",
};

export function TurnView({
  turn,
  onRetry,
}: {
  turn: Turn;
  onRetry: () => void;
}) {
  const pending =
    turn.status === "searching" && turn.sources.length > 0
      ? "Reading the verses"
      : STATUS_TEXT[turn.status];
  return (
    <article className="space-y-6">
      <h2 className="rise border-l-2 border-sindoor pl-4 font-serif text-[1.375rem] leading-snug tracking-[-0.01em] text-ink italic sm:text-2xl">
        {turn.question}
      </h2>

      {turn.crisis && <CrisisCard />}
      <Sources verses={turn.sources} />

      {pending && !turn.answer && (
        <p
          className="flex items-center gap-2.5 font-sans text-sm text-ink-faint"
          aria-live="polite"
        >
          <span className="breathe size-1.5 rounded-full bg-sindoor" />
          {pending}
        </p>
      )}

      {turn.answer && (
        <Answer
          content={turn.answer}
          sources={turn.sources}
          streaming={turn.status === "writing"}
        />
      )}

      {turn.status === "stopped" && (
        <p className="font-sans text-xs text-ink-faint">Stopped.</p>
      )}

      {turn.status === "error" && (
        <div
          className="flex flex-wrap items-center gap-3 font-sans text-sm"
          role="alert"
        >
          <span className="text-ink-soft">
            {turn.error ?? "Something went wrong."}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-rule-strong px-3 py-1 text-ink transition-colors hover:bg-paper-sunk"
          >
            Try again
          </button>
        </div>
      )}
    </article>
  );
}
