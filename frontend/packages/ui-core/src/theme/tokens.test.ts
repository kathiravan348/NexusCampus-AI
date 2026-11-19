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

  it("Campus Prism palette is frozen (D39)", () => {
    // Changing any value here needs a new Owner decision that replaces D39.
    const frozenColors: Record<string, { light: string; dark: string }> = {
      "bg-sidebar": { light: "#FFFFFF", dark: "#070E1B" },
      "bg-ground": { light: "#F4F7FC", dark: "#0B1426" },
      "bg-raised": { light: "#EBF1FA", dark: "#111F38" },
      "bg-surface": { light: "#FFFFFF", dark: "#152542" },
      "border-default": { light: "#D7E2F0", dark: "#23385E" },
      "border-strong": { light: "#7389A6", dark: "#5B76A3" },
      "text-primary": { light: "#0F172A", dark: "#F1F5FC" },
      "text-secondary": { light: "#2D3E55", dark: "#C3D0E6" },
      "text-muted": { light: "#51637A", dark: "#99ABC7" },
      "brand-primary": { light: "#1D4ED8", dark: "#2E6EE8" },
      "brand-primary-text": { light: "#1D4ED8", dark: "#8AB4FF" },
      "brand-primary-subtle": { light: "#E6EFFE", dark: "#1A315C" },
      "on-brand": { light: "#FFFFFF", dark: "#FFFFFF" },
      "brand-accent": { light: "#0D9488", dark: "#2DD4BF" },
      "brand-sky": { light: "#0284C7", dark: "#38BDF8" },
      success: { light: "#087A52", dark: "#2BC48A" },
      "success-subtle": { light: "#E3F4EC", dark: "#0F2A21" },
      "success-text": { light: "#0A6B48", dark: "#5EDBAA" },
      danger: { light: "#C4323F", dark: "#F0616D" },
      "danger-subtle": { light: "#FBEBEC", dark: "#3A171C" },
      "danger-text": { light: "#A3242F", dark: "#FF9AA2" },
      warning: { light: "#9A6100", dark: "#E8B04B" },
      "warning-subtle": { light: "#FDF3E1", dark: "#33280F" },
      "warning-text": { light: "#6B4600", dark: "#F2C877" },
      info: { light: "#0369A1", dark: "#38BDF8" },
      "info-subtle": { light: "#E0F2FE", dark: "#0C2A3A" },
      "info-text": { light: "#075985", dark: "#7DD3FC" },
      "chart-series-1": { light: "#1D4ED8", dark: "#5B9BFF" },
      "chart-series-2": { light: "#C25A00", dark: "#FF9F43" },
      "chart-series-3": { light: "#7B4BD6", dark: "#B48CFF" },
      "chart-series-4": { light: "#007E99", dark: "#38C6E0" },
      "chart-series-5": { light: "#C22978", dark: "#FF6FB5" },
      "chart-series-6": { light: "#8A7300", dark: "#E5D24A" },
    };
    const frozenRadius = {
      "radius-xs": "4px",
      "radius-md": "8px",
      "radius-lg": "12px",
      "radius-pill": "999px",
    };
    expect(Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]))).toEqual(
      frozenColors,
    );
    expect(Object.fromEntries(tokens.radius.tokens.map((t) => [t.name, t.value]))).toEqual(
      frozenRadius,
    );
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

  it("puts the hero glow in :root, derived from brand tokens with no hex (D39)", () => {
    const glow = /--hero-glow: ([^;]+);/.exec(rootBlock)?.[1] ?? "";
    expect(glow).toContain("var(--brand-primary)");
    expect(glow).toContain("var(--brand-accent)");
    expect(glow).not.toMatch(/#[0-9a-fA-F]{3,8}/);
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
