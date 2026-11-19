import { afterEach, describe, expect, it } from "vitest";
import { ThemeContrastError } from "./contrast";
import {
  TENANT_THEME_STYLE_ID,
  ThemeValueError,
  applyTenantTheme,
  resetTenantTheme,
  tenantThemeCss,
} from "./tenantTheme";

const styleText = () => document.getElementById(TENANT_THEME_STYLE_ID)?.textContent ?? null;
const declaredVars = (cssText: string) =>
  [...cssText.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]);

afterEach(() => resetTenantTheme());

describe("applyTenantTheme", () => {
  it("sets only the variables a partial theme names", () => {
    applyTenantTheme({ light: { "brand-primary": "#0F5132" } });
    const text = styleText()!;
    expect(declaredVars(text)).toEqual(["brand-primary"]);
    expect(text).toContain('html:not([data-theme="dark"]) {\n  --brand-primary: #0F5132;');
    expect(text).not.toContain('html[data-theme="dark"]');
  });

  it("keeps light and dark overrides apart", () => {
    applyTenantTheme({
      light: { "brand-primary": "#0F5132" },
      dark: { "brand-primary": "#15803D" },
    });
    const text = styleText()!;
    expect(text).toContain('html:not([data-theme="dark"]) {\n  --brand-primary: #0F5132;');
    expect(text).toContain('html[data-theme="dark"] {\n  --brand-primary: #15803D;');
  });

  it("applies fonts, radius and density as shared variables", () => {
    applyTenantTheme({
      fonts: { sans: "noto-sans-arabic" },
      radius: { "radius-md": "4px" },
      density: "compact",
    });
    const text = styleText()!;
    expect(text).toMatch(/html:root \{[^}]*--font-sans: "Noto Sans Arabic"/);
    expect(text).toContain("--radius-md: 4px;");
    expect(text).toContain("--density-scale: 0.875;");
    expect(declaredVars(text)).toEqual(["font-sans", "radius-md", "density-scale"]);
  });

  it("refuses a theme that fails contrast and leaves the page unchanged", () => {
    expect(() => applyTenantTheme({ light: { "brand-primary": "#FFEB3B" } })).toThrow(
      ThemeContrastError,
    );
    expect(styleText()).toBeNull();
  });

  it("rejects unknown tokens and malformed values", () => {
    expect(() => applyTenantTheme({ light: { "brand-purple": "#000000" } })).toThrow(
      ThemeValueError,
    );
    expect(() => applyTenantTheme({ light: { "brand-primary": "blue" } })).toThrow(ThemeValueError);
    expect(() => applyTenantTheme({ radius: { "radius-huge": "9px" } })).toThrow(ThemeValueError);
    expect(() => applyTenantTheme({ radius: { "radius-md": "1rem" } })).toThrow(ThemeValueError);
    expect(() => applyTenantTheme({ density: "roomy" as "compact" })).toThrow(ThemeValueError);
    expect(styleText()).toBeNull();
  });

  it("replaces the previous tenant theme and can be reset", () => {
    applyTenantTheme({ light: { "brand-primary": "#0F5132" } });
    applyTenantTheme({ density: "spacious" });
    expect(document.querySelectorAll(`#${TENANT_THEME_STYLE_ID}`)).toHaveLength(1);
    expect(styleText()).not.toContain("brand-primary");
    resetTenantTheme();
    expect(styleText()).toBeNull();
  });
});

describe("tenantThemeCss", () => {
  it("is empty for an empty theme", () => {
    expect(tenantThemeCss({})).toBe("");
  });
});
