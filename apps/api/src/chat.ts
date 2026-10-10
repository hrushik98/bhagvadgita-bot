import type { ChatEvent, ChatMessage } from "@gita/shared";
import type { LlmClient, ReasoningEffort } from "./deepseek.ts";
import {
  buildAnswerMessages,
  buildSearchQueryMessages,
  formatVerses,
} from "./prompts.ts";
import type { GitaRepository } from "./repository.ts";
import type { Retriever } from "./retrieval.ts";
import { detectCrisis } from "./safety.ts";

export interface ChatServiceOptions {
  llm: LlmClient;
  retriever: Retriever;
  repository: GitaRepository;
  topK: number;
  reasoningEffort: ReasoningEffort;
  logger?: Pick<Console, "warn">;
}

/** Answers one chat turn: retrieve verses, then stream a grounded answer. */
export class ChatService {
  private readonly options: ChatServiceOptions;

  constructor(options: ChatServiceOptions) {
    this.options = options;
  }

  async *answer(
    messages: ChatMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const { llm, retriever, repository, topK, reasoningEffort } = this.options;
    const question = messages.at(-1);
    if (!question || question.role !== "user") {
      throw new Error("The last message must be from the user");
    }
    const history = messages.slice(0, -1);

    if (detectCrisis(question.content))
      yield { type: "notice", kind: "crisis" };

    const queries = await this.searchQueries(history, question.content, signal);
    const retrieved = await retriever.search(queries, topK);
    yield { type: "sources", verses: retrieved.map((r) => r.verse) };

    const translations = repository.getTranslationsForPrompt(
      retrieved.map((r) => r.id),
    );
    const llmMessages = buildAnswerMessages(
      history,
      question.content,
      formatVerses(retrieved, translations),
    );

    let thinking = false;
    for await (const chunk of llm.stream({
      messages: llmMessages,
      reasoningEffort,
      signal,
    })) {
      if (chunk.type === "reasoning") {
        if (!thinking) {
          thinking = true;
          yield { type: "thinking" };
        }
        continue;
      }
      yield { type: "delta", text: chunk.text };
    }
    yield { type: "done" };
  }

  /**
   * The person's own words, plus an English standalone rewrite when the message
   * is a follow-up or is not written in Latin script. Both are searched and
   * fused, so a poor rewrite cannot make retrieval worse.
   */
  private async searchQueries(
    history: ChatMessage[],
    question: string,
    signal: AbortSignal,
  ): Promise<string[]> {
    if (history.length === 0 && !hasNonLatinLetters(question))
      return [question];
    try {
      const rewritten = await this.options.llm.complete({
        messages: buildSearchQueryMessages(history, question),
        reasoningEffort: "none",
        maxTokens: 120,
        timeoutMs: 8000,
        signal,
      });
      if (rewritten) return [question, rewritten];
    } catch (error) {
      if (signal.aborted) throw error;
      this.options.logger?.warn(
        "Search query rewrite failed, using the raw message",
        error,
      );
    }
    const previousQuestion = history.findLast(
      (m) => m.role === "user",
    )?.content;
    return previousQuestion
      ? [question, `${previousQuestion}\n${question}`]
      : [question];
  }
}

function hasNonLatinLetters(text: string): boolean {
  return /(?!\p{Script=Latin})\p{Letter}/u.test(text);
}
