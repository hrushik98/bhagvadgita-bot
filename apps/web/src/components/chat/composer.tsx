"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef } from "react";

const MAX_LENGTH = 2000;

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  busy: boolean;
  autoFocus?: boolean;
  placeholder: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a limit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && window.matchMedia("(hover: hover)").matches)
      textarea.current?.focus();
  }, [autoFocus]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    )
      submit(event);
  }

  const canSend = value.trim().length > 0 && !busy;

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 rounded-2xl border border-rule-strong bg-paper-raised p-2 pl-4 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset,0_10px_30px_-18px_rgb(35_28_22/0.45)] transition-colors focus-within:border-sindoor/60"
    >
      <label htmlFor="question" className="sr-only">
        Your question
      </label>
      <textarea
        id="question"
        ref={textarea}
        rows={1}
        value={value}
        maxLength={MAX_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="max-h-[220px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 font-serif text-[1.0625rem] leading-relaxed text-ink outline-none focus-visible:outline-none placeholder:text-ink-faint/80 placeholder:italic"
      />
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop answering"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-rule-strong text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          <span className="size-3 rounded-[3px] bg-current" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Ask"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-sindoor text-paper transition-colors hover:bg-sindoor-hover disabled:bg-rule disabled:text-ink-faint"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-[18px]"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 16V4M10 4l-5 5M10 4l5 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </form>
  );
}
