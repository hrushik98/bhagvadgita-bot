import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChapter } from "@/lib/api";
import { parsePositiveInt, toDevanagariNumber } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/read/[chapter]">): Promise<Metadata> {
  const number = parsePositiveInt((await params).chapter);
  const chapter = number ? await getChapter(number).catch(() => null) : null;
  return chapter
    ? {
        title: `Chapter ${chapter.number}: ${chapter.transliteratedName}`,
        description: chapter.meaning,
      }
    : {};
}

export default async function ChapterPage({
  params,
}: PageProps<"/read/[chapter]">) {
  const number = parsePositiveInt((await params).chapter);
  const chapter = number ? await getChapter(number) : null;
  if (!chapter) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      <nav aria-label="Breadcrumb" className="font-sans text-sm text-ink-faint">
        <Link href="/read" className="hover:text-ink">
          Read
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Chapter {chapter.number}</span>
      </nav>

      <header className="mt-8">
        <p className="label text-sindoor">
          Chapter {chapter.number} ·{" "}
          <span lang="sa">अध्याय {toDevanagariNumber(chapter.number)}</span>
        </p>
        <h1
          lang="sa"
          className="mt-3 font-sanskrit text-[2.5rem] leading-tight text-ink sm:text-[3.25rem]"
        >
          {chapter.name}
        </h1>
        <p className="mt-2 font-serif text-2xl text-ink">
          {chapter.transliteratedName}
          <span className="text-ink-faint"> · </span>
          <em className="text-ink-soft">{chapter.meaning}</em>
        </p>
      </header>

      <div className="mt-8 space-y-4 border-l-2 border-rule pl-5 font-serif text-[1.0625rem] leading-relaxed text-ink-soft">
        {chapter.summary
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
      </div>

      <h2 className="label mt-14 text-ink-faint">
        {chapter.verses.length} verses
      </h2>
      <ol className="mt-4 border-t border-rule">
        {chapter.verses.map((verse) => (
          <li key={verse.ref} className="border-b border-rule">
            <Link
              href={`/read/${verse.chapter}/${verse.verse}`}
              className="group grid grid-cols-[3.25rem_1fr] gap-x-4 py-5 sm:grid-cols-[4rem_1fr]"
            >
              <span className="pt-1 font-sans text-sm font-semibold tabular-nums text-sindoor">
                {verse.ref}
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-[1.0625rem] leading-relaxed text-ink transition-colors group-hover:text-sindoor">
                  {verse.translation}
                </span>
                <span className="mt-1.5 block truncate font-serif text-sm text-ink-faint italic">
                  {verse.transliteration.split("\n").join(" · ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
