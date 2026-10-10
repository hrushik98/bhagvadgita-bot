const devanagariDigits = new Intl.NumberFormat("hi-IN-u-nu-deva", {
  useGrouping: false,
});

export function toDevanagariNumber(value: number): string {
  return devanagariDigits.format(value);
}

/** "2026-10-10" -> "10 October", without depending on the server's time zone. */
export function formatDayMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

export function askAboutVerseHref(ref: string): string {
  return `/?q=${encodeURIComponent(`What does verse ${ref} mean, and how can I apply it in my life?`)}`;
}

/** Parses a route param that must be a positive integer. */
export function parsePositiveInt(value: string): number | null {
  return /^\d{1,3}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}
