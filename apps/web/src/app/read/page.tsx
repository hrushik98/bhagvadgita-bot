import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getChapters } from "@/lib/api";
import { toDevanagariNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Read the Gita",
  description:
    "All 18 chapters and 700 verses of the Bhagavad Gita, in Sanskrit with translations.",
};

export default async function ChaptersPage() {
  await connection();
  const chapters = await getChapters();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      <p className="label text-sindoor">Read</p>
      <h1 className="mt-3 font-serif text-[2.4rem] leading-tight tracking-[-0.02em] sm:text-5xl">
        Eighteen chapters
      </h1>
      <p className="mt-4 max-w-xl font-serif text-lg leading-relaxed text-ink-soft">
        The dialogue between Krishna and Arjuna on the field of Kurukshetra,
        verse by verse, in Sanskrit with English and Hindi translations.
      </p>

      <ol className="mt-12 border-t border-rule">
        {chapters.map((chapter) => (
          <li key={chapter.number} className="border-b border-rule">
            <Link
              href={`/read/${chapter.number}`}
              className="group grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-4 py-5 sm:grid-cols-[3.25rem_1fr_auto] sm:gap-x-5"
            >
              <span className="text-center font-sanskrit text-[2.25rem] leading-none text-sindoor/80 transition-colors group-hover:text-sindoor sm:text-[2.6rem]">
                {toDevanagariNumber(chapter.number)}
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-xl leading-snug text-ink transition-colors group-hover:text-sindoor sm:text-[1.375rem]">
                  {chapter.transliteratedName}
                </span>
                <span className="mt-0.5 block font-serif text-[0.9375rem] text-ink-soft italic">
                  {chapter.meaning}
                </span>
              </span>
              <span className="font-sans text-xs tabular-nums text-ink-faint">
                {chapter.verseCount} verses
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
