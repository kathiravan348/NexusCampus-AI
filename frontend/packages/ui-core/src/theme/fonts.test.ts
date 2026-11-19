import { describe, expect, it } from "vitest";
import tokens from "./tokens.json";
import { DEFAULT_FONTS, FONT_LIBRARY, resolveFont } from "./fonts";

describe("fonts", () => {
  it("resolves a known font for its role", () => {
    expect(resolveFont("noto-sans-arabic", "sans").id).toBe("noto-sans-arabic");
    expect(resolveFont("jetbrains-mono", "mono").id).toBe("jetbrains-mono");
  });

  it("falls back to the default for unknown ids, no id, or the wrong role", () => {
    expect(resolveFont("comic-sans", "sans").id).toBe(DEFAULT_FONTS.sans);
    expect(resolveFont(undefined, "mono").id).toBe(DEFAULT_FONTS.mono);
    expect(resolveFont("jetbrains-mono", "sans").id).toBe(DEFAULT_FONTS.sans);
    expect(resolveFont("toString", "sans").id).toBe(DEFAULT_FONTS.sans);
  });

  it("keeps the default stacks in sync with tokens.json", () => {
    expect(FONT_LIBRARY[DEFAULT_FONTS.sans].family).toBe(tokens.type.families.sans);
    expect(FONT_LIBRARY[DEFAULT_FONTS.mono].family).toBe(tokens.type.families.mono);
  });

  it("gives every library font a fallback stack ending in a generic family", () => {
    for (const font of Object.values(FONT_LIBRARY)) {
      expect(font.family).toMatch(/(sans-serif|monospace)$/);
    }
  });
});
