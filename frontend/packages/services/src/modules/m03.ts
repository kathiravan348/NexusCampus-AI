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
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

const RadiusTokenNameSchema = z.string().regex(/^radius-[a-z0-9]+(-[a-z0-9]+)*$/);

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

export const ThemeUpdateInputSchema = z.strictObject({
  light: z.record(ColorTokenNameSchema, HexColorSchema),
  dark: z.record(ColorTokenNameSchema, HexColorSchema),
  fonts: z.strictObject({ sans: IdSchema.nullable(), mono: IdSchema.nullable() }),
  radius: z.record(RadiusTokenNameSchema, z.string().regex(/^\d+(\.\d+)?px$/)),
  density: DensitySchema.nullable(),
  assets: z.strictObject({
    logoUrl: AssetUrlSchema.nullable(),
    faviconUrl: AssetUrlSchema.nullable(),
    loginImageUrl: AssetUrlSchema.nullable(),
  }),
});
export type ThemeUpdateInput = z.infer<typeof ThemeUpdateInputSchema>;

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

/**
 * Saves the institution theme layer via `PUT /theme` (M03, L1: online save, invalidates `useTheme`).
 */
export function useSaveTheme(institutionId: string | null = null) {
  const { session } = useSession();
  const qc = useQueryClient();
  const path =
    institutionId === null ? "/theme" : `/theme?institutionId=${encodeURIComponent(institutionId)}`;

  return useOutboxMutation<ThemeUpdateInput, ThemeResponse>({
    moduleId: "M03",
    operation: "theme.save",
    mergeRule: "lww-audited",
    send: async (client, body, idempotencyKey) => {
      const response = await client.send("PUT", path, body, ThemeResponseSchema, {
        headers: idempotencyHeaders(idempotencyKey),
      });
      if (session) {
        const themePrefix = queryKeys.m03.theme(session, null).slice(0, -1);
        await qc.invalidateQueries({ queryKey: themePrefix });
      }
      return response;
    },
  });
}
