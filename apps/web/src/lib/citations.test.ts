import { describe, expect, it } from "vitest";
import { linkCitations, parseVerseHref } from "./citations";

describe("linkCitations", () => {
  it("links bracketed references, including lists", () => {
    expect(linkCitations("Act [2.47]. See [2.47, 6.7] and [BG 18.66].")).toBe(
      "Act [2.47](/read/2/47). See [2.47](/read/2/47) [6.7](/read/6/7) and [18.66](/read/18/66).",
    );
  });

  it("links bare references only when they were retrieved", () => {
    const known = new Set(["3.30", "6.7"]);
    expect(
      linkCitations("yahi 3.30 ka bhaav, aur 6.7 bhi, par 2.47 nahi", known),
    ).toBe(
      "yahi [3.30](/read/3/30) ka bhaav, aur [6.7](/read/6/7) bhi, par 2.47 nahi",
    );
  });

  it("leaves ordinary numbers and existing links alone", () => {
    const known = new Set(["3.5", "2.47", "1.2"]);
    expect(
      linkCitations(
        "sleep 3.5x hours, v1.2.3, 2.475 and [2.47](/read/2/47)",
        known,
      ),
    ).toBe("sleep 3.5x hours, v1.2.3, 2.475 and [2.47](/read/2/47)");
  });

  it("does not touch an unfinished reference while streaming", () => {
    expect(linkCitations("as taught in [2.4")).toBe("as taught in [2.4");
  });
});

describe("parseVerseHref", () => {
  it("recognises verse links only", () => {
    expect(parseVerseHref("/read/2/47")).toBe("2.47");
    expect(parseVerseHref("/read/2")).toBeNull();
    expect(parseVerseHref("https://example.com")).toBeNull();
    expect(parseVerseHref(undefined)).toBeNull();
  });
});
