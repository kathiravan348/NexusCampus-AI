import type { Preview } from "@storybook/react-vite";
import { useLayoutEffect, type ReactNode } from "react";
import { applyTenantTheme, applyTheme, resetTenantTheme, type ThemeName } from "@nexus/ui-core";
import {
  INSTITUTION_TYPES,
  I18nProvider,
  PSEUDO_LOCALE,
  SOURCE_LOCALE,
  type InstitutionType,
} from "@nexus/i18n";
import { SAMPLE_THEMES, findSampleTheme } from "../src/sampleThemes";
import "./preview.css";

const TYPE_LABELS: Readonly<Record<InstitutionType, string>> = {
  ey: "EY — Early years",
  k12: "K12 — School",
  he: "HE — Higher education",
  voc: "VOC — Vocational",
  tp: "TP — Test prep",
  sk: "SK — Skill institute",
  onl: "ONL — Online academy",
  grp: "GRP — Multi-campus group",
};

interface StoryFrameProps {
  theme: ThemeName;
  tenantTheme: string;
  locale: string;
  typePack: InstitutionType;
  children: ReactNode;
}

function StoryFrame({ theme, tenantTheme, locale, typePack, children }: StoryFrameProps) {
  useLayoutEffect(() => {
    applyTheme(theme);
    const sample = findSampleTheme(tenantTheme);
    if (sample) {
      applyTenantTheme(sample.theme);
    } else {
      resetTenantTheme();
    }
  }, [theme, tenantTheme]);

  return (
    <I18nProvider locale={locale} typePack={typePack}>
      {children}
    </I18nProvider>
  );
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Light or dark mode",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
    tenantTheme: {
      description: "Sample institution theme override",
      toolbar: {
        title: "Tenant",
        icon: "paintbrush",
        items: [
          { value: "none", title: "Nexus Default" },
          ...SAMPLE_THEMES.map((entry) => ({ value: entry.id, title: entry.label })),
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: "Locale and text direction",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: [
          { value: SOURCE_LOCALE, title: "English (LTR)" },
          { value: "ar", title: "Arabic (RTL)" },
          { value: PSEUDO_LOCALE, title: "Pseudo (en-XA)" },
        ],
        dynamicTitle: true,
      },
    },
    typePack: {
      description: "Institution type terminology pack",
      toolbar: {
        title: "Type",
        icon: "bookmark",
        items: INSTITUTION_TYPES.map((code) => ({ value: code, title: TYPE_LABELS[code] })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
    tenantTheme: "none",
    locale: SOURCE_LOCALE,
    typePack: "k12",
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals["theme"] ?? "light") as ThemeName;
      const tenantTheme = String(context.globals["tenantTheme"] ?? "none");
      const locale = String(context.globals["locale"] ?? SOURCE_LOCALE);
      const typePack = (context.globals["typePack"] ?? "k12") as InstitutionType;

      return (
        <StoryFrame theme={theme} tenantTheme={tenantTheme} locale={locale} typePack={typePack}>
          <Story />
        </StoryFrame>
      );
    },
  ],
  parameters: {
    layout: "padded",
    viewport: {
      options: {
        mobile: {
          name: "Mobile",
          styles: {
            width: "360px",
            height: "800px",
          },
          type: "mobile",
        },
        tablet: {
          name: "Tablet",
          styles: {
            width: "768px",
            height: "1024px",
          },
          type: "tablet",
        },
        desktop: {
          name: "Desktop",
          styles: {
            width: "1440px",
            height: "900px",
          },
          type: "desktop",
        },
      },
    },
    backgrounds: {
      disable: true,
    },
    a11y: {
      test: "error",
    },
  },
};

export default preview;
