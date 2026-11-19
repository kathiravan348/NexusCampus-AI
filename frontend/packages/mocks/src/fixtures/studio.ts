import type {
  Font,
  SettingScope,
  TextOverride,
  TextOverrideRevision,
  Theme,
} from "@nexus/contracts";
import { CAMPUS, FONT, GROUP, INSTITUTION, TENANT, TEXT_OVERRIDE, THEME, USER } from "./ids";
import { UPDATED_AT } from "./tenants";

/** Self-hosted font library (D29); ids match `@nexus/ui-core` `resolveFont`. */
export const FONTS: readonly Font[] = [
  {
    id: FONT.inter,
    family: "Inter",
    source: "library",
    roles: ["sans"],
    scripts: ["latin", "cyrillic"],
    fileUrl: null,
  },
  {
    id: FONT.notoSansArabic,
    family: "Noto Sans Arabic",
    source: "library",
    roles: ["sans"],
    scripts: ["arabic", "latin"],
    fileUrl: null,
  },
  {
    id: FONT.jetbrainsMono,
    family: "JetBrains Mono",
    source: "library",
    roles: ["mono"],
    scripts: ["latin", "cyrillic"],
    fileUrl: null,
  },
];

const institution = (id: string): SettingScope => ({ kind: "institution", targetId: id });

interface Brand {
  readonly light: Readonly<Record<string, string>>;
  readonly dark: Readonly<Record<string, string>>;
}

/** Brand colours chosen to pass the contrast guard in light and dark (checked against ui-core in review). */
const theme = (
  id: string,
  tenantId: string,
  scope: SettingScope,
  brand: Brand,
  updatedBy: string,
  extra: Partial<Pick<Theme, "fonts" | "radius" | "density" | "assets" | "lockedTokens">> = {},
): Theme => ({
  id,
  tenantId,
  scope,
  light: { ...brand.light },
  dark: { ...brand.dark },
  fonts: extra.fonts ?? { sans: null, mono: null },
  radius: extra.radius ?? {},
  density: extra.density ?? null,
  assets: extra.assets ?? { logoUrl: null, faviconUrl: null, loginImageUrl: null },
  lockedTokens: extra.lockedTokens ?? [],
  version: 1,
  updatedBy,
  updatedAt: UPDATED_AT,
});

const brand = (lightPrimary: string, darkPrimary: string): Brand => ({
  light: {
    "brand-primary": lightPrimary,
    "brand-primary-text": lightPrimary,
    "on-brand": "#FFFFFF",
  },
  dark: { "brand-primary": darkPrimary, "brand-primary-text": darkPrimary, "on-brand": "#0B1122" },
});

/** One theme layer per tenant; the platform default (Nexus Style) is never overridden here. */
export const THEMES: readonly Theme[] = [
  theme(
    THEME.littleSteps,
    TENANT.littleSteps,
    institution(INSTITUTION.littleSteps),
    brand("#B42318", "#FDA29B"),
    USER.lsPriya,
    {
      radius: { "radius-md": "10px" },
      density: "spacious",
      assets: { logoUrl: "/demo/little-steps/logo.svg", faviconUrl: null, loginImageUrl: null },
    },
  ),
  theme(
    THEME.riversideGroup,
    TENANT.riverside,
    { kind: "group", targetId: GROUP.riverside },
    brand("#1D4ED8", "#93C5FD"),
    USER.rvHelen,
    {
      lockedTokens: ["brand-primary"],
      assets: {
        logoUrl: "/demo/riverside/logo.svg",
        faviconUrl: "/demo/riverside/favicon.svg",
        loginImageUrl: null,
      },
    },
  ),
  theme(
    THEME.riversideSchool,
    TENANT.riverside,
    institution(INSTITUTION.riversideSchool),
    { light: {}, dark: {} },
    USER.rvHelen,
    {
      radius: { "radius-md": "4px" },
      density: "compact",
    },
  ),
  theme(
    THEME.northbridge,
    TENANT.northbridge,
    institution(INSTITUTION.northbridge),
    brand("#7A1F3D", "#F4A6C0"),
    USER.nbRobert,
    {
      fonts: { sans: FONT.inter, mono: FONT.jetbrainsMono },
    },
  ),
  theme(
    THEME.apex,
    TENANT.apex,
    institution(INSTITUTION.apex),
    brand("#0F766E", "#5EEAD4"),
    USER.axKhalid,
    {
      fonts: { sans: FONT.notoSansArabic, mono: null },
    },
  ),
  theme(
    THEME.harmony,
    TENANT.harmony,
    institution(INSTITUTION.harmony),
    brand("#6D28D9", "#C4B5FD"),
    USER.hmWeiLing,
  ),
];

const override = (
  id: string,
  tenantId: string,
  scope: SettingScope,
  locale: string,
  key: string,
  message: string,
  version: number,
  updatedBy: string,
): TextOverride => ({
  id,
  tenantId,
  scope,
  locale,
  key,
  message,
  version,
  updatedBy,
  updatedAt: UPDATED_AT,
});

const RV_GROUP: SettingScope = { kind: "group", targetId: GROUP.riverside };

/** Riverside renames learners group-wide and "class" on North campus; Apex has an Arabic override. */
export const TEXT_OVERRIDES: readonly TextOverride[] = [
  override(
    TEXT_OVERRIDE.riversideLearner,
    TENANT.riverside,
    RV_GROUP,
    "en-GB",
    "term.learner",
    "Pupil",
    2,
    USER.rvHelen,
  ),
  override(
    TEXT_OVERRIDE.riversideLearners,
    TENANT.riverside,
    RV_GROUP,
    "en-GB",
    "term.learners",
    "Pupils",
    1,
    USER.rvHelen,
  ),
  override(
    TEXT_OVERRIDE.riversideNorthClass,
    TENANT.riverside,
    { kind: "campus", targetId: CAMPUS.riversideNorth },
    "en-GB",
    "term.class",
    "Form",
    1,
    USER.rvHelen,
  ),
  override(
    TEXT_OVERRIDE.apexLearnerAr,
    TENANT.apex,
    institution(INSTITUTION.apex),
    "ar-AE",
    "term.learner",
    "متدرب",
    1,
    USER.axKhalid,
  ),
];

/** History: every override's revisions up to its current version, oldest first. */
export const TEXT_OVERRIDE_REVISIONS: readonly TextOverrideRevision[] = [
  {
    overrideId: TEXT_OVERRIDE.riversideLearner,
    version: 1,
    message: "Scholar",
    changedBy: USER.rvHelen,
    changedAt: "2026-03-02T10:00:00Z",
  },
  {
    overrideId: TEXT_OVERRIDE.riversideLearner,
    version: 2,
    message: "Pupil",
    changedBy: USER.rvHelen,
    changedAt: UPDATED_AT,
  },
  {
    overrideId: TEXT_OVERRIDE.riversideLearners,
    version: 1,
    message: "Pupils",
    changedBy: USER.rvHelen,
    changedAt: UPDATED_AT,
  },
  {
    overrideId: TEXT_OVERRIDE.riversideNorthClass,
    version: 1,
    message: "Form",
    changedBy: USER.rvHelen,
    changedAt: UPDATED_AT,
  },
  {
    overrideId: TEXT_OVERRIDE.apexLearnerAr,
    version: 1,
    message: "متدرب",
    changedBy: USER.axKhalid,
    changedAt: UPDATED_AT,
  },
];
