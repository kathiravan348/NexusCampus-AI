import tokens from "./tokens.json";
import type { ThemeName } from "./theme";

/** Partial colour overrides for one theme: token name → `#RRGGBB`. */
export type ColorOverrides = Readonly<Record<string, string>>;

export interface ThemeColors {
  light?: ColorOverrides;
  dark?: ColorOverrides;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  /** 4.5 for normal text; 3 for large text, icons, focus rings and borders (WCAG 2.2 SC 1.4.11). */
  minRatio: number;
  usage: string;
}

export interface ContrastFailure extends ContrastPair {
  theme: ThemeName;
  ratio: number;
}

export interface ColorTokenDefinition {
  readonly name: string;
  readonly value: Readonly<Record<ThemeName, string>>;
  readonly usage: string;
}

export const COLOR_TOKENS: readonly ColorTokenDefinition[] = tokens.color.tokens;

export const CONTRAST_PAIRS: readonly ContrastPair[] = tokens.contrastPairs;

export const DEFAULT_COLORS: Readonly<Record<ThemeName, Readonly<Record<string, string>>>> = {
  light: Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value.light])),
  dark: Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value.dark])),
};

export const COLOR_TOKEN_NAMES: ReadonlySet<string> = new Set(
  tokens.color.tokens.map((t) => t.name),
);

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function channel(hex: string, offset: number): number {
  const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  if (!isHexColor(hex)) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG 2.2 contrast ratio, from 1 (same colour) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Every contrast pair that fails in either theme once `theme` is merged over the defaults.
 * An empty list means the theme is safe to apply.
 */
export function checkTheme(theme: ThemeColors): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  for (const mode of ["light", "dark"] as const) {
    const colors = { ...DEFAULT_COLORS[mode], ...theme[mode] };
    for (const pair of CONTRAST_PAIRS) {
      const fg = colors[pair.fg];
      const bg = colors[pair.bg];
      if (fg === undefined || bg === undefined) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < pair.minRatio) failures.push({ ...pair, theme: mode, ratio });
    }
  }
  return failures;
}

export class ThemeContrastError extends Error {
  readonly failures: readonly ContrastFailure[];

  constructor(failures: readonly ContrastFailure[]) {
    const list = failures
      .map(
        (f) => `${f.theme}: ${f.fg} on ${f.bg} is ${f.ratio.toFixed(2)}:1 (needs ${f.minRatio}:1)`,
      )
      .join("; ");
    super(`Theme fails WCAG 2.2 contrast: ${list}`);
    this.name = "ThemeContrastError";
    this.failures = failures;
  }
}
