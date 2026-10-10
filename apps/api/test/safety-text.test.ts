import { describe, expect, it } from "vitest";
import { detectCrisis } from "../src/safety.ts";
import { cleanTranslation, cleanVerseLines } from "../src/text.ts";

describe("detectCrisis", () => {
  it.each([
    "I want to kill myself",
    "there is no reason to live",
    "I've been thinking about suicide",
    "everyone would be better off without me",
    "I keep hurting myself",
    "मैं आत्महत्या के बारे में सोच रहा हूँ",
    "mujhe khudkushi karni hai",
  ])("detects %s", (text) => {
    expect(detectCrisis(text)).toBe(true);
  });

  it.each([
    "How do I kill my procrastination?",
    "Arjuna did not want to kill his relatives",
    "What happens when we die?",
    "I'm dying to know what 2.47 means",
  ])("does not flag %s", (text) => {
    expect(detectCrisis(text)).toBe(false);
  });
});

describe("text cleaning", () => {
  it("strips verse markers and footnotes from translations", () => {
    expect(
      cleanTranslation("।।1.1।। धृतराष्ट्र बोले (टिप्पणी प0 1.2) - हे संजय!\n "),
    ).toBe("धृतराष्ट्र बोले - हे संजय!");
    expect(cleanTranslation("आसक्ति न हो।।")).toBe("आसक्ति न हो।");
  });

  it("keeps one line per pada in verses", () => {
    expect(cleanVerseLines("सञ्जय उवाच\n\nएवमुक्त्वा।\n\nविसृज्य।।1.47।।\n ")).toBe(
      "सञ्जय उवाच\nएवमुक्त्वा।\nविसृज्य॥",
    );
  });
});
