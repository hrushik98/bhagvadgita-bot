// Normalizes text from the gita/gita dataset.

/** Removes "।।2.47।।" verse markers and editorial footnote markers. */
export function cleanTranslation(text: string): string {
  return text
    .replace(/।।\s*\d+\.\d+\s*।।/g, "")
    .replace(/।।/g, "।")
    .replace(/\(टिप्पणी\s*प0\s*[\d.]+\)/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/ +([,.;:?!])/g, "$1")
    .trim();
}

/** Keeps one line per pada, drops blank lines and the trailing verse marker. */
export function cleanVerseLines(text: string): string {
  return text
    .replace(/।।\s*\d+\.\d+\s*।।/g, "॥")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
