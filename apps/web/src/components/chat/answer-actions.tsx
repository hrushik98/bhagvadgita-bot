"use client";

import type { TranslationTarget } from "@gita/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toggleReadAloud, useReadAloud } from "@/lib/read-aloud";
import { detectIndicScript } from "@/lib/script";
import type { Turn } from "./use-conversation";

const LANGUAGES: {
  target: TranslationTarget;
  native: string;
  english: string;
}[] = [
  { target: "hindi", native: "हिन्दी", english: "Hindi" },
  { target: "telugu", native: "తెలుగు", english: "Telugu" },
];

const iconButton =
  "grid size-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink aria-expanded:bg-paper-sunk aria-expanded:text-ink";

/** Translate and read-aloud controls shown under a finished answer. */
export function AnswerActions({
  turn,
  shownText,
  onTranslate,
  onShowOriginal,
}: {
  turn: Turn;
  shownText: string;
  onTranslate: (target: TranslationTarget) => void;
  onShowOriginal: () => void;
}) {
  const view = turn.view ?? "original";
  const original = detectIndicScript(turn.answer);
  const languages = LANGUAGES.filter((l) => l.target !== original);
  const viewing = LANGUAGES.find((l) => l.target === view);
  const audioKey = `${turn.id}:${view}`;
  const readAloud = useReadAloud();
  const audioStatus = readAloud.key === audioKey ? readAloud.status : "idle";
  const audioError =
    readAloud.error?.key === audioKey ? readAloud.error.message : null;
  const message =
    turn.translationError ??
    audioError ??
    (turn.translating ? `Translating to ${viewing?.english}...` : null);

  return (
    <div className="-ml-2 flex flex-wrap items-center gap-x-1 gap-y-2 font-sans text-sm">
      <TranslateMenu
        languages={languages}
        view={view}
        disabled={Boolean(turn.translating)}
        onSelect={(target) =>
          target === "original" ? onShowOriginal() : onTranslate(target)
        }
      />
      <button
        type="button"
        className={iconButton}
        disabled={Boolean(turn.translating)}
        onClick={() => toggleReadAloud(audioKey, shownText)}
        aria-label={
          audioStatus === "idle" ? "Read aloud" : "Stop reading aloud"
        }
        title={audioStatus === "idle" ? "Read aloud" : "Stop"}
        aria-pressed={audioStatus !== "idle"}
      >
        {audioStatus === "loading" ? (
          <SpinnerIcon />
        ) : audioStatus === "playing" ? (
          <StopIcon />
        ) : (
          <SpeakerIcon />
        )}
      </button>

      {audioStatus === "playing" && (
        <span className="flex items-center gap-[3px] pl-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="equalizer h-3 w-[3px] rounded-full bg-sindoor"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )}

      {viewing && !turn.translating && (
        <span className="pl-1 text-xs text-ink-faint">
          Translated to {viewing.english} ·{" "}
          <button
            type="button"
            onClick={onShowOriginal}
            className="underline underline-offset-2 hover:text-ink"
          >
            Show original
          </button>
        </span>
      )}
      {message && (
        <output className="pl-1 text-xs text-ink-faint">{message}</output>
      )}
    </div>
  );
}

function TranslateMenu({
  languages,
  view,
  disabled,
  onSelect,
}: {
  languages: typeof LANGUAGES;
  view: "original" | TranslationTarget;
  disabled: boolean;
  onSelect: (target: "original" | TranslationTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape; hover opening is handled in CSS.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (target: "original" | TranslationTarget) => {
    setOpen(false);
    onSelect(target);
  };

  const options = [
    ...languages.map((l) => ({
      target: l.target,
      native: l.native,
      english: l.english,
    })),
    ...(view !== "original"
      ? [{ target: "original" as const, native: "Original", english: "" }]
      : []),
  ];

  return (
    <div ref={root} className="group/translate relative">
      <button
        type="button"
        className={iconButton}
        disabled={disabled}
        aria-label="Translate"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <TranslateIcon />
      </button>
      {!disabled && (
        // pb-2 bridges the gap so the menu stays open while the pointer moves onto it.
        <div
          className={`absolute bottom-full left-0 z-30 pb-2 ${
            open
              ? "block"
              : "hidden [@media(hover:hover)]:group-hover/translate:block"
          }`}
        >
          <div
            role="menu"
            aria-label="Translate to"
            className="min-w-44 rounded-lg border border-rule-strong bg-paper-raised p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]"
          >
            <p className="label px-3 pt-2 pb-1.5 text-ink-faint">
              Translate to
            </p>
            {options.map((option) => (
              <button
                key={option.target}
                type="button"
                role="menuitemradio"
                aria-checked={view === option.target}
                onClick={() => choose(option.target)}
                className="flex w-full items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-ink transition-colors hover:bg-paper-sunk"
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={
                      option.english ? "font-sanskrit text-base" : "font-sans"
                    }
                  >
                    {option.native}
                  </span>
                  {option.english && (
                    <span className="text-xs text-ink-faint">
                      {option.english}
                    </span>
                  )}
                </span>
                {view === option.target && <CheckIcon />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Icon({
  children,
  className = "size-[18px]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Icons adapted from Lucide (ISC license).
function TranslateIcon() {
  return (
    <Icon>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </Icon>
  );
}

function SpeakerIcon() {
  return (
    <Icon>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </Icon>
  );
}

function StopIcon() {
  return (
    <Icon className="size-[18px] text-sindoor">
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="2"
        fill="currentColor"
        stroke="none"
      />
    </Icon>
  );
}

function SpinnerIcon() {
  return (
    <Icon className="size-[18px] animate-spin text-sindoor">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  );
}

function CheckIcon() {
  return (
    <Icon className="size-4 text-sindoor">
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}
