import Link from "next/link";
import { connection } from "next/server";
import { getVerseOfTheDay } from "@/lib/api";
import { askAboutVerseHref, formatDayMonth } from "@/lib/format";

export async function VerseOfTheDay() {
  await connection();
  const today = await getVerseOfTheDay().catch(() => null);
  if (!today) return null;
  const { verse, date } = today;

  return (
    <section
      className="relative border-t border-rule pt-8"
      aria-labelledby="votd-heading"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="votd-heading" className="label text-ink-faint">
          Verse for {formatDayMonth(date)}
        </h2>
        <Link
          href={`/read/${verse.chapter}/${verse.verse}`}
          className="label text-sindoor hover:text-sindoor-hover"
        >
          {verse.chapterName} · {verse.ref}
        </Link>
      </div>
      <p
        lang="sa"
        className="mt-6 font-sanskrit text-[1.35rem] leading-[1.9] whitespace-pre-line text-ink sm:text-[1.5rem]"
      >
        {verse.sanskrit}
      </p>
      <p className="mt-5 font-serif text-[1.1875rem] leading-relaxed text-ink-soft">
        {verse.translation}
      </p>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-sans text-sm">
        <Link
          href={`/read/${verse.chapter}/${verse.verse}`}
          className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
        >
          Read the verse
        </Link>
        <Link
          href={askAboutVerseHref(verse.ref)}
          className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
        >
          Ask about it
        </Link>
      </div>
    </section>
  );
}

export function VerseOfTheDaySkeleton() {
  return (
    <div className="border-t border-rule pt-8" aria-hidden="true">
      <div className="h-3 w-40 rounded bg-paper-sunk" />
      <div className="mt-6 h-6 w-4/5 rounded bg-paper-sunk" />
      <div className="mt-3 h-6 w-3/5 rounded bg-paper-sunk" />
      <div className="mt-6 h-4 w-full rounded bg-paper-sunk" />
    </div>
  );
}
