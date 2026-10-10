import type { ChatEvent, ChatMessage } from "@gita/shared";
import { API_URL } from "./api-url";

export class ChatRequestError extends Error {}

/** POSTs a conversation to the API and yields server-sent chat events. */
export async function* streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ChatRequestError(
      "Can't reach the Gita Guide server. Is the API running?",
    );
  }

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ChatRequestError(
      body?.error ?? `Request failed (${response.status})`,
    );
  }

  // A reader loop rather than `for await`, which not every browser supports on streams.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield JSON.parse(data) as ChatEvent;
    }
  }
}
