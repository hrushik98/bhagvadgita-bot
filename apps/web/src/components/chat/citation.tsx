"use client";

import type { VerseSummary } from "@gita/shared";
import Link from "next/link";
import { useRef, useState } from "react";

const PREVIEW_WIDTH = 288;

const VARIANTS = {
  inline:
    "mx-[0.1em] -translate-y-[0.1em] px-[0.5em] py-[0.05em] text-[0.7em] border-sindoor/30 bg-sindoor-wash",
  chip: "px-2.5 py-1 text-xs border-rule-strong bg-paper-raised",
};

/** A verse reference that links to the verse and previews it on hover or focus. */
export function Citation({
  refId,
  verse,
  variant = "inline",
}: {
  refId: string;
  verse?: VerseSummary;
  variant?: keyof typeof VARIANTS;
}) {
  const [chapter, verseNumber] = refId.split(".");
  const anchor = useRef<HTMLSpanElement>(null);
  const [align, setAlign] = useState<"left" | "right">("left");

  function placePreview() {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect)
      setAlign(
        rect.left + PREVIEW_WIDTH + 16 > window.innerWidth ? "right" : "left",
      );
  }

  return (
    <span ref={anchor} className="group/cite relative inline-block">
      <Link
        href={`/read/${chapter}/${verseNumber}`}
        onFocus={placePreview}
        onMouseEnter={placePreview}
        className={`inline-flex items-center rounded-full border font-sans font-semibold tabular-nums tracking-wide text-sindoor no-underline transition-colors hover:border-sindoor/60 hover:text-sindoor-hover ${VARIANTS[variant]}`}
        aria-label={`Bhagavad Gita verse ${refId}`}
      >
        {refId}
      </Link>
      {verse && (
        <span
          role="tooltip"
          style={{ width: PREVIEW_WIDTH }}
          className={`pointer-events-none absolute top-full z-40 mt-2 hidden rounded-lg border border-rule-strong bg-paper-raised p-4 text-left shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] group-focus-within/cite:block [@media(hover:hover)]:group-hover/cite:block ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <span className="label block text-sindoor">
            Bhagavad Gita {refId}
          </span>
          <span className="mt-2 block font-serif text-[0.9375rem] leading-snug font-normal text-ink">
            {verse.translation}
          </span>
        </span>
      )}
    </span>
  );
}
