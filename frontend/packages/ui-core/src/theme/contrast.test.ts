import { describe, expect, it } from "vitest";
import { ThemeContrastError, checkTheme, contrastRatio, relativeLuminance } from "./contrast";

describe("contrastRatio", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(4.5);
  });

  it("rejects values that are not #RRGGBB", () => {
    expect(() => relativeLuminance("red")).toThrow();
    expect(() => relativeLuminance("#FFF")).toThrow();
  });
});

describe("checkTheme", () => {
  it("passes the default Nexus Style themes", () => {
    expect(checkTheme({})).toEqual([]);
  });

  it("names the failing pair for a yellow primary colour on white", () => {
    const failures = checkTheme({ light: { "brand-primary": "#FFEB3B" } });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((f) => f.theme === "light")).toBe(true);
    expect(failures).toContainEqual(
      expect.objectContaining({ fg: "brand-primary", bg: "bg-surface", minRatio: 3 }),
    );
    expect(failures).toContainEqual(
      expect.objectContaining({ fg: "on-brand", bg: "brand-primary" }),
    );
  });

  it("checks each theme separately", () => {
    const failures = checkTheme({ dark: { "text-primary": "#182238" } });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((f) => f.theme === "dark")).toBe(true);
  });

  it("uses 3:1 for icons and borders but 4.5:1 for text", () => {
    // ~3.5:1 on white: fine for an icon, not for body text.
    const grey = "#8A8A8A";
    expect(checkTheme({ light: { success: grey } })).toEqual([]);
    expect(checkTheme({ light: { "text-muted": grey } })).toContainEqual(
      expect.objectContaining({ fg: "text-muted", minRatio: 4.5 }),
    );
  });
});

describe("ThemeContrastError", () => {
  it("lists every failure in its message", () => {
    const failures = checkTheme({ light: { "brand-primary": "#FFEB3B" } });
    const error = new ThemeContrastError(failures);
    expect(error.failures).toBe(failures);
    expect(error.message).toContain("brand-primary on bg-surface");
  });
});
