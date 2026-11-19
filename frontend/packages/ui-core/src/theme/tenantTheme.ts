import tokens from "./tokens.json";
import {
  COLOR_TOKEN_NAMES,
  ThemeContrastError,
  checkTheme,
  isHexColor,
  type ColorOverrides,
} from "./contrast";
import { resolveFont } from "./fonts";

export type Density = "compact" | "comfortable" | "spacious";

/** An institution's theme (C-1, D7): every part is optional and merges over Nexus Style. */
export interface TenantTheme {
  light?: ColorOverrides;
  dark?: ColorOverrides;
  /** Font ids from FONT_LIBRARY. */
  fonts?: { sans?: string; mono?: string };
  /** Radius token name → px value, e.g. `{ "radius-md": "6px" }`. */
  radius?: Readonly<Record<string, string>>;
  density?: Density;
}

export class ThemeValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeValueError";
  }
}

export const TENANT_THEME_STYLE_ID = "nexus-tenant-theme";

const RADIUS_NAMES: ReadonlySet<string> = new Set(tokens.radius.tokens.map((t) => t.name));
const DENSITY_SCALE: ReadonlyMap<string, number> = new Map(
  tokens.density.presets.map((p) => [p.name, p.scale]),
);
const PX = /^\d+(\.\d+)?px$/;

function validate(theme: TenantTheme): void {
  for (const mode of ["light", "dark"] as const) {
    for (const [name, value] of Object.entries(theme[mode] ?? {})) {
      if (!COLOR_TOKEN_NAMES.has(name)) throw new ThemeValueError(`Unknown colour token: ${name}`);
      if (!isHexColor(value)) throw new ThemeValueError(`${name} must be #RRGGBB, got ${value}`);
    }
  }
  for (const [name, value] of Object.entries(theme.radius ?? {})) {
    if (!RADIUS_NAMES.has(name)) throw new ThemeValueError(`Unknown radius token: ${name}`);
    if (!PX.test(value)) throw new ThemeValueError(`${name} must be a px value, got ${value}`);
  }
  if (theme.density !== undefined && !DENSITY_SCALE.has(theme.density)) {
    throw new ThemeValueError(`Unknown density: ${String(theme.density)}`);
  }
}

function block(selector: string, vars: Readonly<Record<string, string>>): string {
  const entries = Object.entries(vars);
  if (entries.length === 0) return "";
  return `${selector} {\n${entries.map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}\n`;
}

/** The CSS a theme produces: CSS variables only, scoped so light and dark stay separate. */
export function tenantThemeCss(theme: TenantTheme): string {
  const shared: Record<string, string> = {};
  if (theme.fonts?.sans !== undefined)
    shared["font-sans"] = resolveFont(theme.fonts.sans, "sans").family;
  if (theme.fonts?.mono !== undefined)
    shared["font-mono"] = resolveFont(theme.fonts.mono, "mono").family;
  Object.assign(shared, theme.radius);
  if (theme.density !== undefined)
    shared["density-scale"] = String(DENSITY_SCALE.get(theme.density));

  // `html` selectors outrank the generated `:root` / `[data-theme]` rules in tokens.css.
  return [
    block("html:root", shared),
    block('html:not([data-theme="dark"])', theme.light ?? {}),
    block('html[data-theme="dark"]', theme.dark ?? {}),
  ].join("");
}

/**
 * Validates and applies an institution theme on `<html>`. Throws ThemeValueError for unknown
 * tokens or bad values, and ThemeContrastError when any contrast pair fails in either theme.
 * Replaces any previously applied tenant theme.
 */
export function applyTenantTheme(theme: TenantTheme, doc: Document = document): void {
  validate(theme);
  const failures = checkTheme(theme);
  if (failures.length > 0) throw new ThemeContrastError(failures);

  for (const role of ["sans", "mono"] as const) {
    const id = theme.fonts?.[role];
    // A font that fails to load (e.g. offline) must not break the theme: the stack falls back.
    if (id !== undefined)
      void resolveFont(id, role)
        .load()
        .catch(() => undefined);
  }

  let style = doc.getElementById(TENANT_THEME_STYLE_ID);
  if (!style) {
    style = doc.createElement("style");
    style.id = TENANT_THEME_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = tenantThemeCss(theme);
}

/** Removes the tenant theme; Nexus Style defaults apply again. */
export function resetTenantTheme(doc: Document = document): void {
  doc.getElementById(TENANT_THEME_STYLE_ID)?.remove();
}
