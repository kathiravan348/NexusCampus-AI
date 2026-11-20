import type { TenantTheme } from "@nexus/ui-core";

export interface SampleTheme {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly theme: TenantTheme;
}

/**
 * Fictional institution themes for the Storybook toolbar (NEX-004).
 * Every entry is verified against `checkTheme()` in `sampleThemes.test.ts` so selecting one can
 * never throw `ThemeContrastError`.
 */
export const SAMPLE_THEMES: readonly SampleTheme[] = [
  {
    id: "green-school",
    label: "Greenwood School",
    description: "Forest green brand primary in light and dark modes.",
    theme: {
      light: {
        "brand-primary": "#166B3E",
      },
      dark: {
        "brand-primary": "#1F804C",
      },
    },
  },
  {
    id: "purple-academy",
    label: "Violetta Music Academy",
    description: "Purple primary, warm amber accent, crisp 4px radius, spacious density.",
    theme: {
      light: {
        "brand-primary": "#6D28D9",
        "brand-accent": "#B45309",
      },
      dark: {
        "brand-primary": "#854EE8",
        "brand-accent": "#F59E0B",
      },
      radius: {
        "radius-md": "4px",
      },
      density: "spacious",
    },
  },
  {
    id: "tamil-college",
    label: "Kaveri Arts College",
    description: "Tamil-first sans font stack and compact density.",
    theme: {
      fonts: {
        sans: "noto-sans-tamil",
      },
      density: "compact",
    },
  },
];

export function findSampleTheme(id: string | undefined): SampleTheme | undefined {
  return SAMPLE_THEMES.find((entry) => entry.id === id);
}
