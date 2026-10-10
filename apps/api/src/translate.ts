import type { TranslationTarget } from "@gita/shared";
import type { LlmMessage } from "./deepseek.ts";

const TARGETS: Record<
  TranslationTarget,
  { language: string; script: string; you: string; example: string }
> = {
  hindi: {
    language: "Hindi",
    script: "Devanagari",
    you: "आप",
    example: "fruits of action is कर्मफल",
  },
  telugu: {
    language: "Telugu",
    script: "Telugu script",
    you: "మీరు",
    example: "fruits of action is కర్మఫలం",
  },
};

export function buildTranslationMessages(
  text: string,
  target: TranslationTarget,
): LlmMessage[] {
  const t = TARGETS[target];
  return [
    {
      role: "system",
      content: `Translate the text the user gives you into ${t.language}, written in ${t.script}.
It is guidance based on the Bhagavad Gita, so use the traditional ${t.language} terms for Gita concepts (for example, ${t.example}).
Write natural, warm ${t.language} that reads as if it were written in ${t.language}, not a word-for-word rendering.
Address the reader respectfully (${t.you}).
Keep the Markdown formatting, paragraph breaks and lists exactly as they are.
Keep verse references such as [2.47] or [2.47, 2.48] exactly as written, including the brackets.
Keep Sanskrit words in ${t.script} where a reader would expect them.
Output only the translation.`,
    },
    { role: "user", content: text },
  ];
}
