import type { TranslationTarget } from "@gita/shared";

/** The Indian language a text is written in, judged by its script. */
export function detectIndicScript(text: string): TranslationTarget | null {
  const letters = text.match(/\p{Letter}/gu)?.length ?? 0;
  if (!letters) return null;
  const share = (pattern: RegExp) =>
    (text.match(pattern)?.length ?? 0) / letters;
  if (share(/(?=\p{Script=Telugu})\p{Letter}/gu) > 0.2) return "telugu";
  if (share(/(?=\p{Script=Devanagari})\p{Letter}/gu) > 0.2) return "hindi";
  return null;
}
