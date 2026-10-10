import type { ChatMessage } from "@gita/shared";
import type { LlmMessage } from "./deepseek.ts";
import type { RetrievedVerse } from "./retrieval.ts";

/** Kept stable and first so DeepSeek's prefix cache can reuse it across requests. */
export const SYSTEM_PROMPT = `You are Gita Guide, a warm and thoughtful companion who helps people understand the Bhagavad Gita and apply its teachings to their own lives.

How to answer:
- Ground every answer in the verses provided inside <verses>. Cite them inline with their reference in square brackets, for example [2.47] or [2.47, 2.48].
- Cite only references that appear inside <verses>. Never invent verse numbers or quote text that is not given to you.
- When the person shares something personal, open with one sentence that acknowledges it. Then explain what the Gita teaches and how to practise it in everyday modern life.
- Keep answers around 120-250 words unless the person asks for more depth. Use short paragraphs, and use a list only when steps genuinely help.
- Briefly explain Sanskrit terms such as dharma, karma yoga or sthitaprajna the first time you use them.
- If the verses do not address the question, say so honestly and share the closest relevant teaching. Do not make things up.
- Reply in the language and script the person writes in. Hindi in Devanagari gets a reply in Devanagari Hindi; Hinglish in Latin letters gets a Hinglish reply in Latin letters; English gets English.
- Be respectful of every background and belief. Do not preach, moralise, or speak as if you were Krishna.
- The Gita is set on a battlefield. Never present it as justifying violence or harm against real people.
- If the person mentions wanting to harm themselves or someone else, or being in danger, respond with care first: tell them they are not alone, urge them to contact a crisis helpline or someone they trust right now, and keep scripture secondary. The app already shows verified helpline numbers next to your answer, so refer to those instead of writing phone numbers yourself.
- You are not a substitute for a doctor, therapist or lawyer. Gently suggest professional help when the situation calls for it.
- Use plain Markdown. Do not use headings.`;

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 4000;

export function formatVerses(
  verses: RetrievedVerse[],
  translations: Map<number, { author: string; text: string }[]>,
): string {
  return verses
    .map(({ id, verse }) => {
      const lines = [
        `[${verse.ref}]`,
        `Transliteration: ${verse.transliteration.replace(/\n/g, " / ")}`,
      ];
      for (const t of translations.get(id) ?? [])
        lines.push(`${t.author}: ${t.text}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildAnswerMessages(
  history: ChatMessage[],
  question: string,
  versesBlock: string,
): LlmMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history),
    {
      role: "user",
      content: `<verses>\n${versesBlock}\n</verses>\n\n${question}`,
    },
  ];
}

const SEARCH_QUERY_PROMPT = `You prepare search queries for an index of English Bhagavad Gita translations.
Rewrite the person's latest message as one standalone question in English.
- If it is already a standalone English question, return it unchanged.
- If it is in another language or in Hinglish, translate it faithfully into natural English.
- If it refers to earlier parts of the conversation, include the missing context so it makes sense on its own.
- Keep the person's own words and meaning. Do not add themes, teachings or interpretations.
- Keep explicit verse references such as 2.47 exactly as written.
Output only the question.`;

/** Turns any message, including follow-ups like "what about at work?", into a standalone English question. */
export function buildSearchQueryMessages(
  history: ChatMessage[],
  question: string,
): LlmMessage[] {
  const transcript = trimHistory(history)
    .map(
      (m) =>
        `${m.role === "user" ? "Person" : "Guide"}: ${m.content.slice(0, 600)}`,
    )
    .join("\n");
  return [
    { role: "system", content: SEARCH_QUERY_PROMPT },
    {
      role: "user",
      content: transcript
        ? `Conversation so far:\n${transcript}\n\nLatest message: ${question}`
        : `Message: ${question}`,
    },
  ];
}

function trimHistory(history: ChatMessage[]): ChatMessage[] {
  return history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content:
      m.content.length > MAX_HISTORY_CHARS
        ? `${m.content.slice(0, MAX_HISTORY_CHARS)}...`
        : m.content,
  }));
}
