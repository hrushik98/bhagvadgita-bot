import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectSpeechLanguage,
  SpeechService,
  SpeechUnavailableError,
  splitForSpeech,
  type TtsProvider,
  toSpeechText,
} from "../src/speech.ts";
import { FakeTts } from "./fixtures.ts";

const drain = async (chunks: AsyncIterable<Uint8Array>) => {
  for await (const _ of chunks);
};

describe("detectSpeechLanguage", () => {
  it.each([
    ["Your right is to the work [2.47].", "english"],
    ["Aap ka adhikaar sirf karm par hai", "english"],
    ["आपका अधिकार केवल कर्म पर है [2.47]।", "hindi"],
    ["మీ హక్కు కర్మ చేయడంలో ఉంది [2.47].", "telugu"],
    [
      "Krishna says कर्मण्येवाधिकारस्ते in the second chapter of the Gita, about duty.",
      "english",
    ],
  ] as const)("%s -> %s", (text, language) => {
    expect(detectSpeechLanguage(text)).toBe(language);
  });
});

describe("toSpeechText", () => {
  it("removes citations, links and Markdown", () => {
    const markdown =
      "Your right is to the **work**, not its *fruits* [2.47].\n\n- Breathe [2.48, 6.7].\n1. Act — see [this](/read/2/47).";
    expect(toSpeechText(markdown)).toBe(
      "Your right is to the work, not its fruits.\n\nBreathe.\nAct — see this.",
    );
  });
});

describe("splitForSpeech", () => {
  it("keeps short text whole", () => {
    expect(splitForSpeech("One. Two.", 100)).toEqual(["One. Two."]);
  });

  it("splits long text at sentence boundaries within the limit", () => {
    const pieces = splitForSpeech(
      "First sentence here. Second one here. Third one.",
      25,
    );
    expect(pieces).toEqual([
      "First sentence here.",
      "Second one here.",
      "Third one.",
    ]);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(25);
  });

  it("hard-splits a sentence longer than the limit", () => {
    expect(splitForSpeech("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("SpeechService", () => {
  const setup = (
    overrides: Partial<
      Record<"english" | "hindi" | "telugu", TtsProvider | null>
    > = {},
  ) => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "speech-"));
    const english = new FakeTts("en", 12);
    const hindi = new FakeTts("hi");
    const service = new SpeechService({
      cacheDir,
      providers: { english, hindi, telugu: null, ...overrides },
    });
    return { service, english, hindi, cacheDir };
  };

  it("routes by language, streams every piece, and caches the result", async () => {
    const { service, english, hindi } = setup();
    const { id, language } = service.prepare(
      "Hold it lightly. Act fully [2.47].",
    );
    expect(language).toBe("english");
    await drain(service.generate(id, new AbortController().signal));
    expect(english.calls).toEqual(["Hold it", "lightly.", "Act fully."]);
    expect(hindi.calls).toEqual([]);
    const file = service.cachedFile(id);
    expect(file && readFileSync(file, "utf8")).toBe(
      "<Hold >#<light>#<Act f>".replaceAll("#", ""),
    );
  });

  it("gives the same id to the same text and voice", () => {
    const { service } = setup();
    expect(service.prepare("Same text.").id).toBe(
      service.prepare("Same **text**.").id,
    );
  });

  it("does not cache partial audio when the provider fails", async () => {
    const english = new FakeTts("en");
    english.fail = true;
    const { service, cacheDir } = setup({ english });
    const { id } = service.prepare("Hello there.");
    await expect(
      drain(service.generate(id, new AbortController().signal)),
    ).rejects.toThrow("provider down");
    expect(service.cachedFile(id)).toBeNull();
    expect(existsSync(cacheDir) && service.hasJob(id)).toBe(true);
  });

  it("refuses languages without a configured provider", () => {
    const { service } = setup();
    expect(() => service.prepare("మీ హక్కు కర్మ చేయడంలో ఉంది")).toThrow(
      SpeechUnavailableError,
    );
  });
});
