import { describe, expect, it } from "vitest";
import { checkTheme, contrastRatio, DEFAULT_COLORS } from "./contrast";
import {
  suggestAccessibleColor,
  suggestBrandPair,
  suggestFixForFailure,
  suggestOnColor,
} from "./suggest";

describe("suggestOnColor", () => {
  it("picks the first candidate meeting 4.5:1", () => {
    expect(suggestOnColor("#1F5FD1", ["#3B82F6", "#FFFFFF", "#000000"])).toBe("#FFFFFF");
    expect(suggestOnColor("#FDE047", ["#FFFFFF", "#141922", "#000000"])).toBe("#141922");
  });

  it("falls back to white or black when no candidate passes", () => {
    expect(suggestOnColor("#1E3A8A", ["#2563EB"])).toBe("#FFFFFF");
    expect(suggestOnColor("#FEF08A", ["#FACC15"])).toBe("#000000");
  });

  it("always returns a colour meeting 4.5:1 for any background", () => {
    for (const bg of ["#000000", "#FFFFFF", "#767676", "#F59E0B", "#10B981", "#93C5FD"]) {
      const suggested = suggestOnColor(bg, []);
      expect(contrastRatio(suggested, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("throws on non-hex background", () => {
    expect(() => suggestOnColor("blue", [])).toThrow();
  });
});

describe("suggestAccessibleColor", () => {
  it("keeps the colour when it already meets contrast against all backgrounds", () => {
    expect(suggestAccessibleColor("#1F5FD1", ["#FFFFFF", "#F5F6F8"])).toBe("#1F5FD1");
  });

  it("darkens a bright colour on light surfaces to pass 4.5:1", () => {
    const backgrounds = ["#FFFFFF", "#F5F6F8", "#E4ECFB"];
    const suggested = suggestAccessibleColor("#F59E0B", backgrounds, 4.5);
    for (const bg of backgrounds) {
      expect(contrastRatio(suggested, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lightens a dark colour on dark surfaces to pass 4.5:1", () => {
    const backgrounds = ["#182238", "#10172A", "#1E3560"];
    const suggested = suggestAccessibleColor("#1D4ED8", backgrounds, 4.5);
    for (const bg of backgrounds) {
      expect(contrastRatio(suggested, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("suggestBrandPair & suggestFixForFailure", () => {
  it("suggests passing on-brand and brand-primary-text for a light amber brand-primary", () => {
    const pair = suggestBrandPair("#F59E0B", DEFAULT_COLORS.light);
    expect(contrastRatio(pair.onBrand, "#F59E0B")).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(pair.brandPrimaryText, DEFAULT_COLORS.light["bg-surface"]!),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(pair.brandPrimaryText, DEFAULT_COLORS.light["brand-primary-subtle"]!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("resolves contrast failures when applied", () => {
    const broken = { light: { "brand-primary": "#FDE047", "on-brand": "#FFFFFF" } };
    const failures = checkTheme(broken);
    expect(failures.length).toBeGreaterThan(0);

    const nextLight: Record<string, string> = { ...DEFAULT_COLORS.light, ...broken.light };
    for (const failure of failures) {
      const fix = suggestFixForFailure(failure, nextLight);
      nextLight[fix.token] = fix.value;
    }
    expect(checkTheme({ light: nextLight })).toEqual([]);
  });

  it("targets bg when fg is locked", () => {
    const modeColors = {
      ...DEFAULT_COLORS.light,
      "brand-primary": "#1D4ED8",
      "bg-surface": "#1E3A8A",
    };
    const failure = checkTheme({ light: modeColors }).find(
      (f) => f.fg === "brand-primary" && f.bg === "bg-surface",
    );
    expect(failure).toBeDefined();
    const fix = suggestFixForFailure(failure!, modeColors, new Set(["brand-primary"]));
    expect(fix.token).toBe("bg-surface");
  });
});
