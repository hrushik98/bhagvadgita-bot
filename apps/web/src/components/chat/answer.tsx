"use client";

import type { VerseSummary } from "@gita/shared";
import { memo, useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import { linkCitations, parseVerseHref } from "@/lib/citations";
import { Citation } from "./citation";

export const Answer = memo(function Answer({
  content,
  sources,
  streaming,
}: {
  content: string;
  sources: VerseSummary[];
  streaming: boolean;
}) {
  const knownRefs = useMemo(
    () => new Set(sources.map((v) => v.ref)),
    [sources],
  );
  const components = useMemo<Components>(() => {
    const byRef = new Map(sources.map((v) => [v.ref, v]));
    return {
      a({ href, children }) {
        const ref = parseVerseHref(href);
        if (ref) return <Citation refId={ref} verse={byRef.get(ref)} />;
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-sindoor underline underline-offset-2"
          >
            {children}
          </a>
        );
      },
      h1: ({ children }) => <p className="font-semibold">{children}</p>,
      h2: ({ children }) => <p className="font-semibold">{children}</p>,
      h3: ({ children }) => <p className="font-semibold">{children}</p>,
      img: () => null,
    };
  }, [sources]);

  return (
    <div className={streaming ? "answer streaming" : "answer"}>
      <Markdown components={components} skipHtml>
        {linkCitations(content, knownRefs)}
      </Markdown>
    </div>
  );
});
