import {
  AssetUrlSchema,
  ColorTokenNameSchema,
  DensitySchema,
  FontSchema,
  HexColorSchema,
  IdSchema,
  PAGE_SIZE_MAX,
  ThemeSchema,
  TokenNameSchema,
  pageSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

/** All theme layers merged (outer layers first) for the theme engine. */
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

export const FontPageSchema = pageSchema(FontSchema);

/** The tenant's theme; with `campusId`, that campus's layer and its institution's apply. */
export function useTheme(campusId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m03.theme(s, campusId),
    (client, signal) => client.get("/theme", ThemeResponseSchema, { campusId }, { signal }),
  );
}

export function useFonts() {
  return useScopedQuery(queryKeys.m03.fonts, (client, signal) =>
    client.get("/fonts", FontPageSchema, { pageSize: PAGE_SIZE_MAX }, { signal }),
  );
}
