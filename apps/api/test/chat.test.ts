import { describe, expect, it } from "vitest";
import { ChatService } from "../src/chat.ts";
import { GitaRepository } from "../src/repository.ts";
import { Retriever } from "../src/retrieval.ts";
import {
  collect,
  createFixtureDb,
  FakeLlm,
  KeywordEmbedder,
} from "./fixtures.ts";

function setup() {
  const db = createFixtureDb();
  const repository = new GitaRepository(db);
  const embedder = new KeywordEmbedder();
  const llm = new FakeLlm();
  const chat = new ChatService({
    llm,
    retriever: new Retriever(db, embedder, repository),
    repository,
    topK: 3,
    reasoningEffort: "low",
  });
  return { chat, llm, embedder };
}

const signal = new AbortController().signal;

describe("ChatService", () => {
  it("streams sources, a thinking marker, text and done, in order", async () => {
    const { chat } = setup();
    const events = await collect(
      chat.answer([{ role: "user", content: "How do I do my work?" }], signal),
    );
    expect(events.map((e) => e.type)).toEqual([
      "sources",
      "thinking",
      "delta",
      "delta",
      "done",
    ]);
    const sources = events[0];
    expect(
      sources?.type === "sources" && sources.verses.map((v) => v.ref),
    ).toContain("2.47");
  });

  it("gives the model the retrieved verses and the conversation history", async () => {
    const { chat, llm } = setup();
    await collect(
      chat.answer(
        [
          { role: "user", content: "What about anger?" },
          { role: "assistant", content: "Anger comes from desire [2.62]." },
          { role: "user", content: "And at work?" },
        ],
        signal,
      ),
    );
    const messages = llm.streamCalls[0]?.messages ?? [];
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messages.at(-1)?.content).toContain("<verses>");
    expect(messages.at(-1)?.content).toContain("[2.62]");
    expect(messages.at(-1)?.content).toContain(
      "Swami Sivananda: From attachment desire is born",
    );
    expect(messages.at(-1)?.content).toMatch(/And at work\?$/);
  });

  it("does not rewrite a first English question", async () => {
    const { chat, llm, embedder } = setup();
    await collect(
      chat.answer([{ role: "user", content: "How do I do my work?" }], signal),
    );
    expect(llm.completeCalls).toHaveLength(0);
    expect(embedder.queries).toEqual(["How do I do my work?"]);
  });

  it("rewrites follow-ups and non-Latin questions, searching both phrasings", async () => {
    const { chat, llm, embedder } = setup();
    await collect(
      chat.answer([{ role: "user", content: "गुस्सा कैसे कंट्रोल करें?" }], signal),
    );
    expect(llm.completeCalls).toHaveLength(1);
    expect(llm.completeCalls[0]?.reasoningEffort).toBe("none");
    expect(embedder.queries).toEqual([
      "गुस्सा कैसे कंट्रोल करें?",
      "How do I handle anger at work?",
    ]);
  });

  it("falls back to the raw message when the rewrite fails", async () => {
    const { chat, llm, embedder } = setup();
    llm.rewrite = new Error("timeout");
    const events = await collect(
      chat.answer(
        [
          { role: "user", content: "Tell me about duty" },
          { role: "assistant", content: "..." },
          { role: "user", content: "more?" },
        ],
        signal,
      ),
    );
    expect(events.at(-1)?.type).toBe("done");
    expect(embedder.queries).toEqual(["more?", "Tell me about duty\nmore?"]);
  });

  it("flags crisis messages before anything else", async () => {
    const { chat } = setup();
    const events = await collect(
      chat.answer([{ role: "user", content: "I want to end my life" }], signal),
    );
    expect(events[0]).toEqual({ type: "notice", kind: "crisis" });
  });
});
