// The model cites verses as [2.47] or [2.47, 2.48]. Turn each reference into a
// Markdown link to the verse page so the renderer can show it as a citation.

const CITATION =
  /\[\s*((?:BG\s*)?\d{1,2}\.\d{1,2}(?:\s*[,;]\s*(?:BG\s*)?\d{1,2}\.\d{1,2})*)\s*\](?!\()/gi;

export function linkCitations(
  markdown: string,
  knownRefs: ReadonlySet<string> = new Set(),
): string {
  const linked = markdown.replace(CITATION, (_match, inner: string) =>
    inner
      .split(/\s*[,;]\s*/)
      .map((ref) => {
        const [, chapter, verse] = ref.match(/(\d{1,2})\.(\d{1,2})/) ?? [];
        return `[${chapter}.${verse}](/read/${chapter}/${verse})`;
      })
      .join(" "),
  );
  return knownRefs.size ? linkBareRefs(linked, knownRefs) : linked;
}

// Bare mentions like "as 2.47 says" are linked only when they match a verse
// retrieved for this answer, so ordinary numbers such as "3.5 hours" are left alone.
// Existing Markdown links are skipped.
const LINK_OR_BARE_REF =
  /\[[^\]]*\]\([^)]*\)|(?<![\w.])(\d{1,2})\.(\d{1,2})(?![\w.]*\d|\w)/g;

function linkBareRefs(
  markdown: string,
  knownRefs: ReadonlySet<string>,
): string {
  return markdown.replace(
    LINK_OR_BARE_REF,
    (match, chapter?: string, verse?: string) => {
      if (!chapter || !verse) return match;
      const ref = `${chapter}.${verse}`;
      return knownRefs.has(ref) ? `[${ref}](/read/${chapter}/${verse})` : match;
    },
  );
}

export function parseVerseHref(href: string | undefined): string | null {
  const match = href?.match(/^\/read\/(\d{1,2})\/(\d{1,2})$/);
  return match ? `${match[1]}.${match[2]}` : null;
}
