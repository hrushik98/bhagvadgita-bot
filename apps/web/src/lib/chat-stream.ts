import type {
  ChatEvent,
  ChatMessage,
  TranslateEvent,
  TranslationTarget,
} from "@gita/shared";
import { postEventStream } from "./event-stream";

export { ApiRequestError } from "./event-stream";

export function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  return postEventStream<ChatEvent>("/chat", { messages }, signal);
}

export function streamTranslation(
  text: string,
  target: TranslationTarget,
  signal: AbortSignal,
): AsyncGenerator<TranslateEvent> {
  return postEventStream<TranslateEvent>(
    "/translate",
    { text, target },
    signal,
  );
}
