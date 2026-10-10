"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Composer } from "./composer";
import { TurnView } from "./turn-view";
import { useConversation } from "./use-conversation";

const SUGGESTIONS = [
  "How do I stay calm under pressure?",
  "I lost someone I love. How do I live with the grief?",
  "How can I work hard without obsessing over results?",
  "मन बहुत अशांत रहता है, क्या करूँ?",
];

export function Chat({ welcome }: { welcome: ReactNode }) {
  const {
    turns,
    hydrated,
    busy,
    ask,
    retry,
    stop,
    reset,
    translate,
    showOriginal,
  } = useConversation();
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Prefill from ?q= (used by "Ask about this verse" links), then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setInput(q);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Follow the streaming answer unless the reader has scrolled up.
  useEffect(() => {
    const onScroll = () => {
      const distance =
        document.documentElement.scrollHeight -
        window.innerHeight -
        window.scrollY;
      stickToBottom.current = distance < 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const lastTurn = turns.at(-1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the latest answer grows
  useLayoutEffect(() => {
    if (stickToBottom.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [lastTurn?.answer, lastTurn?.sources, lastTurn?.status, turns.length]);

  function submit(question: string) {
    stickToBottom.current = true;
    ask(question);
    setInput("");
  }

  const empty = hydrated && turns.length === 0;

  if (!hydrated) return <div className="flex-1" />;

  if (empty) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pt-14 pb-20 sm:px-6 sm:pt-24">
        <p className="label rise text-sindoor">
          Bhagavad Gita · <span lang="sa">भगवद्गीता</span>
        </p>
        <h1 className="rise mt-4 font-serif text-balance text-[2.6rem] leading-[1.05] font-normal tracking-[-0.02em] text-ink [animation-delay:60ms] sm:text-[3.5rem]">
          What weighs on <em className="text-sindoor">your</em> mind?
        </h1>
        <p className="rise mt-5 max-w-xl font-serif text-lg leading-relaxed text-ink-soft [animation-delay:120ms]">
          Ask about work, loss, purpose or the restless mind. Every answer draws
          on the Gita's 700 verses and cites the ones it uses.
        </p>

        <div className="rise mt-9 [animation-delay:180ms]">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            onStop={stop}
            busy={busy}
            autoFocus
            placeholder="Ask in English or Hindi..."
          />
          <ul className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-[1.125rem] border border-rule bg-paper-raised/60 px-3.5 py-1.5 text-left font-serif text-[0.9375rem] text-ink-soft transition-colors hover:border-rule-strong hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rise mt-16 [animation-delay:260ms]">{welcome}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
      <div className="flex justify-end pt-5">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-3 py-1 font-sans text-xs font-medium text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          New conversation
        </button>
      </div>

      <div className="flex-1 space-y-14 pt-4 pb-10">
        {turns.map((turn) => (
          <TurnView
            key={turn.id}
            turn={turn}
            onRetry={() => retry(turn.id)}
            onTranslate={(target) => void translate(turn.id, target)}
            onShowOriginal={() => showOriginal(turn.id)}
          />
        ))}
        <div ref={bottom} className="scroll-mb-36" />
      </div>

      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-paper from-70% to-transparent px-4 pt-6 pb-4 sm:-mx-6 sm:px-6 sm:pb-6">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={submit}
          onStop={stop}
          busy={busy}
          placeholder="Ask a follow-up..."
        />
        <p className="mt-2 text-center font-sans text-[0.6875rem] text-ink-faint">
          AI answers can be wrong. Check the cited verses.
        </p>
      </div>
    </main>
  );
}
