import type { Translation } from "@gita/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVerse } from "@/lib/api";
import { askAboutVerseHref, parsePositiveInt } from "@/lib/format";

async function loadVerse(params: Promise<{ chapter: string; verse: string }>) {
  const { chapter, verse } = await params;
  const c = parsePositiveInt(chapter);
  const v = parsePositiveInt(verse);
  return c && v ? getVerse(c, v) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/read/[chapter]/[verse]">): Promise<Metadata> {
  const verse = await loadVerse(params).catch(() => null);
  return verse
    ? { title: `Bhagavad Gita ${verse.ref}`, description: verse.translation }
    : {};
}

export default async function VersePage({
  params,
}: PageProps<"/read/[chapter]/[verse]">) {
  const verse = await loadVerse(params);
  if (!verse) notFound();

  const [primary, ...others] = verse.translations.filter(
    (t) => t.language === "english",
  );
  const hindi = verse.translations.filter((t) => t.language === "hindi");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      <nav aria-label="Breadcrumb" className="font-sans text-sm text-ink-faint">
        <Link href="/read" className="hover:text-ink">
          Read
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/read/${verse.chapter}`} className="hover:text-ink">
          Chapter {verse.chapter}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-soft">Verse {verse.verse}</span>
      </nav>

      <article className="mt-10">
        <header className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-[2.75rem] leading-none tracking-[-0.02em] tabular-nums text-sindoor sm:text-6xl">
            {verse.ref}
          </h1>
          <p className="label text-right text-ink-faint">{verse.chapterName}</p>
        </header>

        <div className="mt-10 rounded-sm border-y border-rule-strong py-8 text-center sm:py-10">
          <p
            lang="sa"
            className="font-sanskrit text-[1.4rem] leading-[1.95] whitespace-pre-line text-ink sm:text-[1.75rem]"
          >
            {verse.sanskrit}
          </p>
          <p className="mx-auto mt-6 max-w-lg font-serif text-base leading-relaxed whitespace-pre-line text-ink-soft italic sm:text-[1.0625rem]">
            {verse.transliteration}
          </p>
        </div>

        {primary && (
          <figure className="mt-10">
            <blockquote className="font-serif text-[1.375rem] leading-[1.55] text-ink sm:text-[1.5rem]">
              {primary.text}
            </blockquote>
            <figcaption className="label mt-3 text-ink-faint">
              {primary.author}
            </figcaption>
          </figure>
        )}

        <div className="mt-8 flex flex-wrap gap-3 font-sans text-sm">
          <Link
            href={askAboutVerseHref(verse.ref)}
            className="rounded-full bg-sindoor px-4 py-2 font-medium text-paper transition-colors hover:bg-sindoor-hover"
          >
            Ask about this verse
          </Link>
        </div>

        {verse.wordMeanings && (
          <details className="group mt-12 border-t border-rule pt-6">
            <summary className="label flex cursor-pointer list-none items-center justify-between text-ink-soft hover:text-ink">
              Word by word
              <span className="text-base leading-none transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-4 font-serif text-base leading-relaxed text-ink-soft">
              {verse.wordMeanings}
            </p>
          </details>
        )}

        {others.length > 0 && (
          <TranslationList
            title="Other translations"
            lang="en"
            translations={others}
          />
        )}
        {hindi.length > 0 && (
          <TranslationList title="हिन्दी अनुवाद" lang="hi" translations={hindi} />
        )}
      </article>

      <nav
        aria-label="Verse navigation"
        className="mt-16 grid grid-cols-2 gap-4 border-t border-rule pt-6 font-sans text-sm"
      >
        {verse.previous ? (
          <Link
            href={`/read/${verse.previous.chapter}/${verse.previous.verse}`}
            className="group justify-self-start text-ink-soft hover:text-ink"
          >
            <span className="label block text-ink-faint">Previous</span>
            <span className="mt-1 block font-serif text-lg tabular-nums">
              ← {verse.previous.chapter}.{verse.previous.verse}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {verse.next && (
          <Link
            href={`/read/${verse.next.chapter}/${verse.next.verse}`}
            className="group justify-self-end text-right text-ink-soft hover:text-ink"
          >
            <span className="label block text-ink-faint">Next</span>
            <span className="mt-1 block font-serif text-lg tabular-nums">
              {verse.next.chapter}.{verse.next.verse} →
            </span>
          </Link>
        )}
      </nav>
    </main>
  );
}

function TranslationList({
  title,
  lang,
  translations,
}: {
  title: string;
  lang: "en" | "hi";
  translations: Translation[];
}) {
  return (
    <section lang={lang} className="mt-12 border-t border-rule pt-6">
      <h2 className="label text-ink-faint">{title}</h2>
      <ul className="mt-5 space-y-6">
        {translations.map((t) => (
          <li key={t.author}>
            <p className="font-serif text-[1.0625rem] leading-relaxed text-ink">
              {t.text}
            </p>
            <p className="mt-1.5 font-sans text-xs text-ink-faint">
              {t.author}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
