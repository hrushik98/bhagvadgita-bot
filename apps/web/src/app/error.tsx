"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-24 pb-24 text-center sm:px-6">
      <h1 className="font-serif text-3xl">Something went quiet</h1>
      <p className="mt-3 font-serif text-lg text-ink-soft">
        We couldn't load this page. If you're running Gita Guide locally, make
        sure the API is running (
        <code className="font-sans text-base">npm run dev</code>).
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-8 rounded-full border border-rule-strong px-4 py-2 font-sans text-sm transition-colors hover:bg-paper-sunk"
      >
        Try again
      </button>
    </main>
  );
}
