import {
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  DEFAULT_COLORS,
  RADIUS_TOKEN_NAMES,
  checkTheme,
  contrastRatio,
  type ThemeColors,
} from "@nexus/ui-core/contrast";
import { THEMES } from "./studio";

/** Sample themes for the backend contrast parity test (NEX-053): every demo layer plus known failures. */
const CONTRAST_CASES: readonly Required<ThemeColors>[] = [
  ...THEMES.map((t) => ({ light: t.light, dark: t.dark })),
  { light: {}, dark: {} },
  { light: { "text-primary": "#9CA3AF" }, dark: {} },
  { light: {}, dark: { "text-primary": "#1F2937", "bg-ground": "#111827" } },
  {
    light: { "brand-primary": "#FACC15", "brand-primary-text": "#FACC15", "on-brand": "#FFFFFF" },
    dark: { "brand-primary": "#1E3A8A", "brand-primary-text": "#1E3A8A", "on-brand": "#0B1122" },
  },
];

const MODES = ["light", "dark"] as const;

/**
 * The ui-core theme tokens and contrast guard results the backend repeats (NEX-053):
 * `backend/src/nexus/modules/m03/design_tokens.json`, written by `export:fixtures`.
 */
export function designTokens() {
  return {
    colors: COLOR_TOKENS.map((t) => ({ name: t.name, light: t.value.light, dark: t.value.dark })),
    radius: [...RADIUS_TOKEN_NAMES],
    contrastPairs: CONTRAST_PAIRS.map((p) => ({ fg: p.fg, bg: p.bg, minRatio: p.minRatio })),
    cases: CONTRAST_CASES.map((c) => ({
      light: c.light,
      dark: c.dark,
      ratios: MODES.flatMap((mode) => {
        const colors: Record<string, string> = { ...DEFAULT_COLORS[mode], ...c[mode] };
        return CONTRAST_PAIRS.flatMap((p) => {
          const fg = colors[p.fg];
          const bg = colors[p.bg];
          return fg === undefined || bg === undefined
            ? []
            : [{ theme: mode, fg: p.fg, bg: p.bg, ratio: contrastRatio(fg, bg) }];
        });
      }),
      failures: checkTheme(c).map((f) => ({ theme: f.theme, fg: f.fg, bg: f.bg })),
    })),
  };
}

export function designTokensJson(): string {
  return `${JSON.stringify(designTokens(), null, 2)}\n`;
}
