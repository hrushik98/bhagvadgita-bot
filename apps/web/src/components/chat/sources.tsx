import type { VerseSummary } from "@gita/shared";
import { Citation } from "./citation";

/** The verses retrieved for an answer. */
export function Sources({ verses }: { verses: VerseSummary[] }) {
  if (verses.length === 0) return null;
  return (
    <section
      aria-label="Verses consulted"
      className="rise flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <h3 className="label text-ink-faint">Verses consulted</h3>
      <ul className="flex flex-wrap gap-1.5">
        {verses.map((verse) => (
          <li key={verse.ref}>
            <Citation refId={verse.ref} verse={verse} variant="chip" />
          </li>
        ))}
      </ul>
    </section>
  );
}
