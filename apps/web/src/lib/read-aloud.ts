"use client";

import type { ApiError, SpeechResponse } from "@gita/shared";
import { useSyncExternalStore } from "react";
import { API_URL } from "./api-url";

// One audio player for the whole page: starting a new answer stops the previous one.

export interface ReadAloudState {
  /** Which text is loading or playing, chosen by the caller (for example turn id + language). */
  key: string | null;
  status: "idle" | "loading" | "playing";
  error: { key: string; message: string } | null;
}

// A silent clip played synchronously on click. It unlocks the audio element in
// browsers (Safari) that only allow playback started directly by a user gesture.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const IDLE: ReadAloudState = { key: null, status: "idle", error: null };

let state: ReadAloudState = IDLE;
let audio: HTMLAudioElement | null = null;
let request = 0;
const listeners = new Set<() => void>();

function setState(next: ReadAloudState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReadAloud(): ReadAloudState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}

export function stopReadAloud(): void {
  request++;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  setState(IDLE);
}

/** Starts reading `text` aloud, or stops it if `key` is already loading or playing. */
export function toggleReadAloud(key: string, text: string): void {
  if (state.key === key && state.status !== "idle") {
    stopReadAloud();
    return;
  }
  stopReadAloud();
  const id = ++request;

  audio ??= new Audio();
  const player = audio;
  player.src = SILENCE;
  player.play().catch(() => {});
  setState({ key, status: "loading", error: null });

  const fail = (message: string) => {
    if (id !== request) return;
    player.pause();
    setState({ key: null, status: "idle", error: { key, message } });
  };

  void (async () => {
    try {
      const response = await fetch(`${API_URL}/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json().catch(() => null)) as
        | (SpeechResponse & ApiError)
        | null;
      if (!response.ok || !body?.url) {
        fail(body?.error ?? "Couldn't read this aloud. Please try again.");
        return;
      }
      if (id !== request) return;

      player.onplaying = () =>
        id === request && setState({ key, status: "playing", error: null });
      player.onended = () => id === request && setState(IDLE);
      player.onerror = () => fail("Couldn't play the audio. Please try again.");
      player.src = `${API_URL}${body.url}`;
      await player.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      fail("Couldn't read this aloud. Please try again.");
    }
  })();
}
