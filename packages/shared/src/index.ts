// Types shared by the API (apps/api) and the web app (apps/web).
// This package is types-only so the API can import it with `import type`
// without a build step.

export type Language = "english" | "hindi";

export interface Chapter {
  number: number;
  /** Devanagari name, e.g. "सांख्ययोग" */
  name: string;
  /** e.g. "Sankhya Yoga" */
  transliteratedName: string;
  /** e.g. "Transcendental Knowledge" */
  meaning: string;
  summary: string;
  summaryHindi: string;
  verseCount: number;
}

export interface VerseRef {
  chapter: number;
  verse: number;
}

export interface Translation {
  author: string;
  language: Language;
  text: string;
}

export interface VerseSummary extends VerseRef {
  /** "2.47" */
  ref: string;
  sanskrit: string;
  transliteration: string;
  /** Primary English translation */
  translation: string;
}

export interface Verse extends VerseSummary {
  chapterName: string;
  wordMeanings: string;
  translations: Translation[];
  previous: VerseRef | null;
  next: VerseRef | null;
}

export interface ChapterDetail extends Chapter {
  verses: VerseSummary[];
}

export interface SearchResponse {
  query: string;
  verses: VerseSummary[];
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

/** Server-sent events emitted by POST /chat, in order. */
export type ChatEvent =
  | { type: "notice"; kind: "crisis" }
  | { type: "sources"; verses: VerseSummary[] }
  | { type: "thinking" }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ApiError {
  error: string;
}

export type TranslationTarget = "hindi" | "telugu";

export interface TranslateRequest {
  text: string;
  target: TranslationTarget;
}

/** Server-sent events emitted by POST /translate. */
export type TranslateEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type SpeechLanguage = "english" | "hindi" | "telugu";

export interface SpeechRequest {
  text: string;
}

export interface SpeechResponse {
  /** Path of the MP3 on the API, e.g. "/speech/<id>.mp3". */
  url: string;
  language: SpeechLanguage;
}
