import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksView } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-baseline gap-2.5"
          aria-label="Gita Guide home"
        >
          <span
            lang="sa"
            className="font-sanskrit text-[1.35rem] leading-none text-sindoor"
          >
            गीता
          </span>
          <span className="font-serif text-[1.05rem] italic tracking-tight text-ink">
            Gita Guide
          </span>
        </Link>
        <Suspense fallback={<NavLinksView pathname={null} />}>
          <NavLinks />
        </Suspense>
      </div>
    </header>
  );
}
