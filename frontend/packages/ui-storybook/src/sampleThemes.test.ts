import { describe, expect, it } from "vitest";
import { checkTheme, tenantThemeCss } from "@nexus/ui-core";
import { SAMPLE_THEMES, findSampleTheme } from "./sampleThemes";

describe("SAMPLE_THEMES", () => {
  it("contains three fictional institution themes with unique ids", () => {
    expect(SAMPLE_THEMES).toHaveLength(3);
    const ids = SAMPLE_THEMES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SAMPLE_THEMES)("passes WCAG 2.2 contrast guard: $id", ({ id, theme }) => {
    expect(checkTheme(theme), `${id} should have zero contrast failures`).toEqual([]);
    expect(tenantThemeCss(theme).length).toBeGreaterThan(0);
  });

  it("looks up sample themes by id", () => {
    expect(findSampleTheme("green-school")?.label).toBe("Greenwood School");
    expect(findSampleTheme("none")).toBeUndefined();
    expect(findSampleTheme(undefined)).toBeUndefined();
  });
});
