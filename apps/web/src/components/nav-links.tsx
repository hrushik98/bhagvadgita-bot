"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ask" },
  { href: "/read", label: "Read" },
];

export function NavLinks() {
  return <NavLinksView pathname={usePathname()} />;
}

/** Renders without an active link when the pathname is not known yet (prerendered shell). */
export function NavLinksView({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex items-center gap-1 font-sans text-sm">
      {LINKS.map((link) => {
        const active =
          pathname !== null &&
          (link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 transition-colors ${
              active
                ? "bg-ink text-paper"
                : "text-ink-soft hover:bg-paper-sunk hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
