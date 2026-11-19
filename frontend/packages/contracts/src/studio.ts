import { z } from "zod";
import { IdSchema, InstitutionTypeSchema, LocaleSchema, UtcDateTimeSchema } from "./common";

const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/**
 * Layer a theme or text override belongs to (C-1, C-2, E-6): platform → group → institution → campus.
 * `targetId` is the group / institution / campus id; null only for `platform`.
 */
export const SettingScopeKindSchema = z.enum(["platform", "group", "institution", "campus"]);
export type SettingScopeKind = z.infer<typeof SettingScopeKindSchema>;

export const SettingScopeSchema = z
  .strictObject({
    kind: SettingScopeKindSchema,
    targetId: IdSchema.nullable(),
  })
  .refine((s) => (s.targetId === null) === (s.kind === "platform"), {
    message: "targetId must be null for platform scope and set for every other scope",
    path: ["targetId"],
  });
export type SettingScope = z.infer<typeof SettingScopeSchema>;

/** Colour value `#RRGGBB` (the format the ui-core theme engine accepts). */
export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, {
  message: "Must be a #RRGGBB colour, e.g. #1A56DB",
});
export type HexColor = z.infer<typeof HexColorSchema>;

/** Design token name in kebab case, e.g. `brand-primary`, `radius-md`. */
export const TokenNameSchema = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, {
  message: "Must be a kebab-case token name, e.g. brand-primary",
});
export const ColorTokenNameSchema = TokenNameSchema;
export type ColorTokenName = z.infer<typeof ColorTokenNameSchema>;

const RadiusTokenNameSchema = z.string().regex(/^radius-[a-z0-9]+(-[a-z0-9]+)*$/, {
  message: "Must be a radius token name, e.g. radius-md",
});

/** Asset or font file: an `https://` URL or a same-origin path starting with `/`. */
export const AssetUrlSchema = z
  .string()
  .max(2048)
  .refine((v) => /^\/(?!\/)\S*$/.test(v) || /^https:\/\/\S+$/.test(v), {
    message: "Must be an https:// URL or a path starting with /",
  });
export type AssetUrl = z.infer<typeof AssetUrlSchema>;

export const DensitySchema = z.enum(["compact", "comfortable", "spacious"]);
export type Density = z.infer<typeof DensitySchema>;

/**
 * One theme layer (C-1, D7, D28). Colour maps are partial overrides merged over Nexus Style; `lockedTokens`
 * (set by a group) cannot be changed by its children. Contrast is checked by the theme engine and server.
 */
export const ThemeSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    scope: SettingScopeSchema,
    light: z.record(ColorTokenNameSchema, HexColorSchema),
    dark: z.record(ColorTokenNameSchema, HexColorSchema),
    /** Font ids from the font library or the tenant's uploads; null = inherit. */
    fonts: z.strictObject({ sans: IdSchema.nullable(), mono: IdSchema.nullable() }),
    radius: z.record(
      RadiusTokenNameSchema,
      z.string().regex(/^\d+(\.\d+)?px$/, { message: "Must be a px value, e.g. 6px" }),
    ),
    density: DensitySchema.nullable(),
    assets: z.strictObject({
      logoUrl: AssetUrlSchema.nullable(),
      faviconUrl: AssetUrlSchema.nullable(),
      loginImageUrl: AssetUrlSchema.nullable(),
    }),
    lockedTokens: z.array(TokenNameSchema),
    version: z.int().min(1),
    updatedBy: IdSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((t) => hasNoDuplicates(t.lockedTokens), {
    message: "lockedTokens has duplicates",
    path: ["lockedTokens"],
  });
export type Theme = z.infer<typeof ThemeSchema>;

export const FontRoleSchema = z.enum(["sans", "mono"]);
export type FontRole = z.infer<typeof FontRoleSchema>;

export const FontScriptSchema = z.enum([
  "latin",
  "arabic",
  "hebrew",
  "devanagari",
  "cyrillic",
  "cjk",
]);
export type FontScript = z.infer<typeof FontScriptSchema>;

/** A font in the library (self-hosted, D29) or uploaded by the tenant (`fileUrl` set only for uploads). */
export const FontSchema = z
  .strictObject({
    id: IdSchema,
    family: z.string().trim().min(1).max(100),
    source: z.enum(["library", "upload"]),
    roles: z.array(FontRoleSchema).min(1),
    scripts: z.array(FontScriptSchema).min(1),
    fileUrl: AssetUrlSchema.nullable(),
  })
  .refine((f) => hasNoDuplicates(f.roles), { message: "roles has duplicates", path: ["roles"] })
  .refine((f) => hasNoDuplicates(f.scripts), {
    message: "scripts has duplicates",
    path: ["scripts"],
  })
  .refine((f) => (f.fileUrl !== null) === (f.source === "upload"), {
    message: "fileUrl is required for uploaded fonts and must be null for library fonts",
    path: ["fileUrl"],
  });
export type Font = z.infer<typeof FontSchema>;

/** `@nexus/i18n` message key: `common.*`, `term.*` or `<module>.*`, e.g. `m02.signIn.title`. */
export const MessageKeySchema = z
  .string()
  .regex(/^(common|term|[mp]\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/, {
    message: "Must be a message key, e.g. term.learner or m02.signIn.title",
  });
export type MessageKeyName = z.infer<typeof MessageKeySchema>;

/** ICU message text. Validity (`isValidMessage`) is checked by the editor and the server. */
const MessageTextSchema = z.string().trim().min(1).max(5000);

/** An institution's replacement for one message in one locale (C-2, D8). Versioned and audited. */
export const TextOverrideSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  scope: SettingScopeSchema,
  locale: LocaleSchema,
  key: MessageKeySchema,
  message: MessageTextSchema,
  version: z.int().min(1),
  updatedBy: IdSchema,
  updatedAt: UtcDateTimeSchema,
});
export type TextOverride = z.infer<typeof TextOverrideSchema>;

/** One entry in an override's history; `message: null` = the override was removed. */
export const TextOverrideRevisionSchema = z.strictObject({
  overrideId: IdSchema,
  version: z.int().min(1),
  message: MessageTextSchema.nullable(),
  changedBy: IdSchema,
  changedAt: UtcDateTimeSchema,
});
export type TextOverrideRevision = z.infer<typeof TextOverrideRevisionSchema>;

/** Words for one institution type in one locale (D28: locale-scoped), e.g. `term.learner` → "Student". */
export const TerminologyPackSchema = z.strictObject({
  type: InstitutionTypeSchema,
  locale: LocaleSchema,
  entries: z.record(MessageKeySchema, MessageTextSchema),
});
export type TerminologyPack = z.infer<typeof TerminologyPackSchema>;
