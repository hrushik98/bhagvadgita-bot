import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-24 pb-24 text-center sm:px-6">
      <p className="font-sanskrit text-4xl text-sindoor">॥</p>
      <h1 className="mt-4 font-serif text-3xl">This page isn't in the text</h1>
      <p className="mt-3 font-serif text-lg text-ink-soft">
        The Gita has 18 chapters and 700 verses, but not this one.
      </p>
      <div className="mt-8 flex justify-center gap-5 font-sans text-sm">
        <Link
          href="/read"
          className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
        >
          Browse chapters
        </Link>
        <Link
          href="/"
          className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
        >
          Ask a question
        </Link>
      </div>
    </main>
  );
}
