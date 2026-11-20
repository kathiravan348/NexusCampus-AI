/**
 * The font library an institution can choose from (C-1). Fonts are self-hosted via @fontsource
 * (no font CDN). This is the only module besides tokens.json that may name a font.
 */

// Default fonts load with ui-core. Hindi (Devanagari) and Tamil use unicode-range: each only downloads
// when that script is on screen (D42).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-tamil/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

export type FontRole = "sans" | "mono";

export interface FontDefinition {
  id: string;
  label: string;
  role: FontRole;
  /** CSS font-family stack, with fallbacks. */
  family: string;
  /** Loads the font's CSS (weights the UI uses). Safe to call more than once. */
  load: () => Promise<unknown>;
}

export const FONT_LIBRARY = {
  inter: {
    id: "inter",
    label: "Inter",
    role: "sans",
    family:
      '"Inter", "Noto Sans Devanagari", "Noto Sans Tamil", system-ui, -apple-system, "Segoe UI", sans-serif',
    load: () =>
      Promise.all([
        import("@fontsource/inter/400.css"),
        import("@fontsource/inter/500.css"),
        import("@fontsource/inter/600.css"),
      ]),
  },
  "noto-sans-devanagari": {
    id: "noto-sans-devanagari",
    label: "Noto Sans Devanagari",
    role: "sans",
    family: '"Noto Sans Devanagari", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    load: () =>
      Promise.all([
        import("@fontsource/noto-sans-devanagari/400.css"),
        import("@fontsource/noto-sans-devanagari/600.css"),
      ]),
  },
  "noto-sans-tamil": {
    id: "noto-sans-tamil",
    label: "Noto Sans Tamil",
    role: "sans",
    family: '"Noto Sans Tamil", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    load: () =>
      Promise.all([
        import("@fontsource/noto-sans-tamil/400.css"),
        import("@fontsource/noto-sans-tamil/600.css"),
      ]),
  },
  "jetbrains-mono": {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    role: "mono",
    family: '"JetBrains Mono", ui-monospace, Consolas, monospace',
    load: () =>
      Promise.all([
        import("@fontsource/jetbrains-mono/400.css"),
        import("@fontsource/jetbrains-mono/500.css"),
      ]),
  },
} as const satisfies Record<string, FontDefinition>;

export type FontId = keyof typeof FONT_LIBRARY;

export const DEFAULT_FONTS: Readonly<Record<FontRole, FontId>> = {
  sans: "inter",
  mono: "jetbrains-mono",
};

function isFontId(id: string): id is FontId {
  return Object.prototype.hasOwnProperty.call(FONT_LIBRARY, id);
}

/** The font for `id` in `role`; an unknown id, or a font of the other role, gives the default. */
export function resolveFont(id: string | undefined, role: FontRole): FontDefinition {
  if (id !== undefined && isFontId(id)) {
    const font: FontDefinition = FONT_LIBRARY[id];
    if (font.role === role) return font;
  }
  return FONT_LIBRARY[DEFAULT_FONTS[role]];
}
