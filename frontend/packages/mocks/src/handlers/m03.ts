import {
  AssetUrlSchema,
  ColorTokenNameSchema,
  DensitySchema,
  FontSchema,
  HexColorSchema,
  IdSchema,
  ThemeSchema,
  TokenNameSchema,
  pageSchema,
  type Theme,
} from "@nexus/contracts";
import { z } from "zod";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const M = { module: "M03" } as const;

/** The merged theme a screen applies (outer layers first; a locked token cannot be changed below). */
export const EffectiveThemeSchema = z.strictObject({
  light: z.record(ColorTokenNameSchema, HexColorSchema),
  dark: z.record(ColorTokenNameSchema, HexColorSchema),
  fonts: z.strictObject({ sans: IdSchema.nullable(), mono: IdSchema.nullable() }),
  radius: z.record(TokenNameSchema, z.string().regex(/^\d+(\.\d+)?px$/)),
  density: DensitySchema.nullable(),
  assets: z.strictObject({
    logoUrl: AssetUrlSchema.nullable(),
    faviconUrl: AssetUrlSchema.nullable(),
    loginImageUrl: AssetUrlSchema.nullable(),
  }),
});
export type EffectiveTheme = z.infer<typeof EffectiveThemeSchema>;

export const ThemeResponseSchema = z.strictObject({
  effective: EffectiveThemeSchema,
  layers: z.array(ThemeSchema),
  lockedTokens: z.array(TokenNameSchema),
});
export type ThemeResponse = z.infer<typeof ThemeResponseSchema>;

const ORDER = { platform: 0, group: 1, institution: 2, campus: 3 } as const;

function mergeTokens(
  into: Record<string, string>,
  from: Readonly<Record<string, string>>,
  locked: ReadonlySet<string>,
): void {
  for (const [token, value] of Object.entries(from)) if (!locked.has(token)) into[token] = value;
}

export function mergeThemes(layers: readonly Theme[]): {
  effective: EffectiveTheme;
  lockedTokens: string[];
} {
  const effective: EffectiveTheme = {
    light: {},
    dark: {},
    fonts: { sans: null, mono: null },
    radius: {},
    density: null,
    assets: { logoUrl: null, faviconUrl: null, loginImageUrl: null },
  };
  const locked = new Set<string>();
  for (const layer of layers) {
    mergeTokens(effective.light, layer.light, locked);
    mergeTokens(effective.dark, layer.dark, locked);
    mergeTokens(effective.radius, layer.radius, locked);
    effective.fonts = {
      sans: layer.fonts.sans ?? effective.fonts.sans,
      mono: layer.fonts.mono ?? effective.fonts.mono,
    };
    effective.density = layer.density ?? effective.density;
    effective.assets = {
      logoUrl: layer.assets.logoUrl ?? effective.assets.logoUrl,
      faviconUrl: layer.assets.faviconUrl ?? effective.assets.faviconUrl,
      loginImageUrl: layer.assets.loginImageUrl ?? effective.assets.loginImageUrl,
    };
    for (const token of layer.lockedTokens) locked.add(token);
  }
  return { effective, lockedTokens: [...locked].sort() };
}

export const m03Handlers = [
  /** `?campusId=` adds that campus's layer and its institution's; without it, all institution layers. */
  get("/theme", M, (ctx) => {
    const tenantId = ctx.viewer.tenantId;
    const campusId = param(ctx.url, "campusId");
    const campus =
      campusId === null
        ? undefined
        : found(ofTenant(mockDb.campuses, tenantId).find((c) => c.id === campusId));
    const layers = ofTenant(mockDb.themes, tenantId)
      .filter((t) => {
        if (t.scope.kind === "campus")
          return campus !== undefined && t.scope.targetId === campus.id;
        if (t.scope.kind === "institution" && campus) {
          return t.scope.targetId === campus.institutionId;
        }
        return true;
      })
      .sort((a, b) => ORDER[a.scope.kind] - ORDER[b.scope.kind]);
    return ok(ThemeResponseSchema, { ...mergeThemes(layers), layers });
  }),

  get("/fonts", M, (ctx) => list(ctx, mockDb.fonts, pageSchema(FontSchema))),
];
