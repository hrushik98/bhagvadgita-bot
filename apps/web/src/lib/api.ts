import type { Chapter, ChapterDetail, Verse } from "@gita/shared";
import { cacheLife } from "next/cache";

import { API_URL } from "./api-url";

/**
 * Where the Next.js server reaches the API. Differs from the browser URL when
 * both run in containers (http://api:5502 vs http://localhost:5502).
 */
const SERVER_API_URL = process.env.API_INTERNAL_URL ?? API_URL;

export class ApiUnavailableError extends Error {}

/** Cached GET against the Express API. Returns null on 404. */
async function get<T>(path: string): Promise<T | null> {
  "use cache";
  cacheLife("hours");
  let response: Response;
  try {
    response = await fetch(`${SERVER_API_URL}${path}`);
  } catch {
    throw new ApiUnavailableError(
      `Could not reach the API at ${SERVER_API_URL}`,
    );
  }
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`API request ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

export async function getChapters(): Promise<Chapter[]> {
  return (await get<Chapter[]>("/chapters")) ?? [];
}

export function getChapter(chapter: number): Promise<ChapterDetail | null> {
  return get<ChapterDetail>(`/chapters/${chapter}`);
}

export function getVerse(
  chapter: number,
  verse: number,
): Promise<Verse | null> {
  return get<Verse>(`/verses/${chapter}/${verse}`);
}

export function getVerseOfTheDay(): Promise<{
  date: string;
  verse: Verse;
} | null> {
  return get<{ date: string; verse: Verse }>("/verse-of-the-day");
}
