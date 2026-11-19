import { describe, expect, it } from "vitest";
import {
  AssetUrlSchema,
  FontSchema,
  HexColorSchema,
  MessageKeySchema,
  SettingScopeSchema,
  TerminologyPackSchema,
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  ThemeSchema,
} from "./studio";

const theme = {
  id: "thm_riverside_group",
  tenantId: "ten_riverside_group",
  scope: { kind: "group", targetId: "grp_riverside" },
  light: { "brand-primary": "#1A56DB", "brand-primary-text": "#FFFFFF" },
  dark: { "brand-primary": "#76A9FA" },
  fonts: { sans: "noto-sans-arabic", mono: null },
  radius: { "radius-md": "6px", "radius-lg": "10.5px" },
  density: "comfortable",
  assets: { logoUrl: "/assets/riverside/logo.svg", faviconUrl: null, loginImageUrl: null },
  lockedTokens: ["brand-primary"],
  version: 3,
  updatedBy: "usr_director",
  updatedAt: "2026-11-01T09:00:00Z",
};

const font = {
  id: "inter",
  family: "Inter",
  source: "library",
  roles: ["sans"],
  scripts: ["latin", "cyrillic"],
  fileUrl: null,
};

const override = {
  id: "txo_01",
  tenantId: "ten_riverside_group",
  scope: { kind: "group", targetId: "grp_riverside" },
  locale: "en-GB",
  key: "term.learner",
  message: "Pupil",
  version: 2,
  updatedBy: "usr_director",
  updatedAt: "2026-10-01T08:00:00Z",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("SettingScope", () => {
  it("platform has no target; every other layer has one", () => {
    expect(SettingScopeSchema.safeParse({ kind: "platform", targetId: null }).success).toBe(true);
    expect(SettingScopeSchema.safeParse({ kind: "campus", targetId: "cmp_north" }).success).toBe(
      true,
    );
    rejects(SettingScopeSchema, [
      { kind: "platform", targetId: "x" },
      { kind: "institution", targetId: null },
      { kind: "department", targetId: "d1" },
      { kind: "campus", targetId: "c1", extra: 1 },
    ]);
  });
});

describe("primitives", () => {
  it("HexColor is #RRGGBB", () => {
    for (const v of ["#1a56db", "#1A56DB"]) expect(HexColorSchema.safeParse(v).success).toBe(true);
    rejects(HexColorSchema, ["1A56DB", "#1A5", "#1A56DBFF", "rgb(0,0,0)", "#GGGGGG"]);
  });

  it("AssetUrl is https or a same-origin path", () => {
    for (const v of ["/assets/logo.svg", "https://cdn.example.edu/logo.png"])
      expect(AssetUrlSchema.safeParse(v).success, v).toBe(true);
    rejects(AssetUrlSchema, [
      "http://example.edu/logo.png",
      "//evil.test/x.png",
      "/\\evil.test/x.png",
      "/assets\\logo.svg",
      "https://cdn.example.edu\\@evil.test/x.png",
      "javascript:alert(1)",
      "logo.png",
      "",
    ]);
  });

  it("MessageKey follows the i18n key pattern", () => {
    for (const v of ["term.learner", "common.save", "m02.signIn.title", "p10.grant.approve"])
      expect(MessageKeySchema.safeParse(v).success, v).toBe(true);
    rejects(MessageKeySchema, ["learner", "app.title", "m02.SignIn", "m2.x", "term."]);
  });
});

describe("Theme", () => {
  it("accepts a valid group theme", () => {
    expect(ThemeSchema.safeParse(theme).success).toBe(true);
    expect(
      ThemeSchema.safeParse({ ...theme, light: {}, dark: {}, radius: {}, density: null }).success,
    ).toBe(true);
  });

  it("rejects bad colours, token names, radius, density, assets and locks", () => {
    rejects(ThemeSchema, [
      { ...theme, light: { "brand-primary": "blue" } },
      { ...theme, dark: { BrandPrimary: "#000000" } },
      { ...theme, radius: { "radius-md": "6rem" } },
      { ...theme, radius: { "brand-primary": "6px" } },
      { ...theme, density: "cosy" },
      { ...theme, assets: { ...theme.assets, logoUrl: "http://x.test/l.svg" } },
      { ...theme, assets: { logoUrl: null, faviconUrl: null } },
      { ...theme, lockedTokens: ["brand-primary", "brand-primary"] },
      { ...theme, version: 0 },
      { ...theme, scope: { kind: "platform", targetId: "grp_riverside" } },
      { ...theme, fontFamily: "Inter" },
    ]);
  });
});

describe("Font", () => {
  it("accepts library and uploaded fonts", () => {
    expect(FontSchema.safeParse(font).success).toBe(true);
    expect(
      FontSchema.safeParse({
        ...font,
        id: "fnt_upload_1",
        source: "upload",
        scripts: ["arabic"],
        fileUrl: "/tenant-fonts/apex/brand.woff2",
      }).success,
    ).toBe(true);
  });

  it("requires fileUrl exactly for uploads and unique roles/scripts", () => {
    rejects(FontSchema, [
      { ...font, fileUrl: "/fonts/inter.woff2" },
      { ...font, source: "upload" },
      { ...font, roles: [] },
      { ...font, roles: ["sans", "sans"] },
      { ...font, scripts: ["latin", "latin"] },
      { ...font, scripts: ["klingon"] },
      { ...font, family: " " },
    ]);
  });
});

describe("TextOverride and revisions", () => {
  it("accepts an override and a removal revision", () => {
    expect(TextOverrideSchema.safeParse(override).success).toBe(true);
    expect(
      TextOverrideRevisionSchema.safeParse({
        overrideId: "txo_01",
        version: 3,
        message: null,
        changedBy: "usr_director",
        changedAt: "2026-10-02T08:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects empty messages, bad keys and locales, extra keys", () => {
    rejects(TextOverrideSchema, [
      { ...override, message: "  " },
      { ...override, key: "Learner" },
      { ...override, locale: "en_GB" },
      { ...override, version: 0 },
      { ...override, previous: "Student" },
    ]);
    rejects(TextOverrideRevisionSchema, [
      { overrideId: "txo_01", version: 1, message: "", changedBy: "u", changedAt: "2026-10-02" },
    ]);
  });
});

describe("TerminologyPack", () => {
  it("is locale-scoped per institution type", () => {
    expect(
      TerminologyPackSchema.safeParse({
        type: "k12",
        locale: "ar",
        entries: { "term.learner": "طالب" },
      }).success,
    ).toBe(true);
    rejects(TerminologyPackSchema, [
      { type: "k13", locale: "en", entries: {} },
      { type: "k12", locale: "en", entries: { learner: "Student" } },
      { type: "k12", locale: "en", entries: { "term.learner": "" } },
    ]);
  });
});
