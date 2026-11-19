import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tokens from "./tokens.json";
import { contrastRatio } from "./contrast";

const themeDir = path.resolve(__dirname);
const css = fs.readFileSync(path.join(themeDir, "tokens.css"), "utf-8");
const tailwindCss = fs.readFileSync(path.join(themeDir, "tailwind-theme.css"), "utf-8");

const rootBlock = /:root\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
const lightBlock = /:root,\s*\[data-theme="light"\]\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
const darkBlock = /\n\[data-theme="dark"\]\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";

describe("tokens.json", () => {
  it("lists light first: light is the default theme", () => {
    expect(tokens.color.themes.map((t) => t.id)).toEqual(["light", "dark"]);
  });

  it("has the Nexus colour set and none of the old trading names", () => {
    const names = tokens.color.tokens.map((t) => t.name);
    for (const name of [
      "brand-primary",
      "brand-primary-text",
      "brand-primary-subtle",
      "on-brand",
    ]) {
      expect(names).toContain(name);
    }
    for (const name of ["brand-accent", "success", "danger", "warning", "info", "info-subtle"]) {
      expect(names).toContain(name);
    }
    for (const old of ["action", "on-action", "profit", "loss", "chart-benchmark"]) {
      expect(names).not.toContain(old);
    }
  });

  it("gives every contrast pair real tokens and a WCAG threshold", () => {
    const names = new Set(tokens.color.tokens.map((t) => t.name));
    for (const pair of tokens.contrastPairs) {
      expect(names.has(pair.fg), pair.fg).toBe(true);
      expect(names.has(pair.bg), pair.bg).toBe(true);
      expect([3, 4.5]).toContain(pair.minRatio);
    }
  });

  it("passes every contrast pair in both default themes", () => {
    for (const mode of ["light", "dark"] as const) {
      const colors = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value[mode]]));
      for (const pair of tokens.contrastPairs) {
        const ratio = contrastRatio(colors[pair.fg]!, colors[pair.bg]!);
        expect(ratio, `${mode} ${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(pair.minRatio);
      }
    }
  });

  it("uses Campus Prism brand defaults while keeping Green/Yellow/Red/Blue status indicators locked (D38)", () => {
    const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
    expect(byName["brand-primary"]).toEqual({ light: "#1D4ED8", dark: "#2E6EE8" });
    expect(byName["brand-accent"]).toEqual({ light: "#0D9488", dark: "#2DD4BF" });
    expect(byName["bg-ground"]).toEqual({ light: "#F4F7FC", dark: "#0B1426" });
    expect(byName["success"]).toEqual({ light: "#087A52", dark: "#2BC48A" });
    expect(byName["warning"]).toEqual({ light: "#9A6100", dark: "#E8B04B" });
    expect(byName["danger"]).toEqual({ light: "#C4323F", dark: "#F0616D" });
    expect(byName["info"]).toEqual({ light: "#0369A1", dark: "#38BDF8" });
  });
});

describe("generated tokens.css", () => {
  it("puts every colour in the light (default) and dark blocks", () => {
    for (const token of tokens.color.tokens) {
      expect(lightBlock).toContain(`--${token.name}: ${token.value.light};`);
      expect(darkBlock).toContain(`--${token.name}: ${token.value.dark};`);
    }
  });

  it("puts fonts, spacing, density, radius and sizes in :root", () => {
    expect(rootBlock).toContain(`--font-sans: ${tokens.type.families.sans};`);
    expect(rootBlock).toContain(`--font-mono: ${tokens.type.families.mono};`);
    expect(rootBlock).toContain("--density-scale: 1;");
    for (const token of [
      ...tokens.spacing.tokens,
      ...tokens.radius.tokens,
      ...tokens.size.tokens,
    ]) {
      expect(rootBlock).toContain(`--${token.name}: ${token.value};`);
    }
  });

  it("has a block per density preset", () => {
    for (const preset of tokens.density.presets) {
      expect(css).toContain(
        `[data-density="${preset.name}"] {\n  --density-scale: ${preset.scale};`,
      );
    }
  });

  it("scales Tailwind spacing by density", () => {
    expect(tailwindCss).toContain("--spacing: calc(var(--space-1) * var(--density-scale));");
  });
});
