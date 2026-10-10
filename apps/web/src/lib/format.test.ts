import { describe, expect, it } from "vitest";
import {
  askAboutVerseHref,
  formatDayMonth,
  parsePositiveInt,
  toDevanagariNumber,
} from "./format";

describe("format helpers", () => {
  it("renders Devanagari numerals", () => {
    expect(toDevanagariNumber(18)).toBe("१८");
  });

  it("formats an ISO date without time zone drift", () => {
    expect(formatDayMonth("2026-01-01")).toBe("1 January");
  });

  it("parses route params strictly", () => {
    expect(parsePositiveInt("47")).toBe(47);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("2.5")).toBeNull();
    expect(parsePositiveInt("1e3")).toBeNull();
  });

  it("builds an Ask link for a verse", () => {
    expect(decodeURIComponent(askAboutVerseHref("2.47"))).toBe(
      "/?q=What does verse 2.47 mean, and how can I apply it in my life?",
    );
  });
});
