import type { Density, Theme } from "@nexus/contracts";
import type { ThemeResponse, ThemeUpdateInput } from "@nexus/services";
import {
  DEFAULT_COLORS,
  DEFAULT_FONTS,
  DEFAULT_RADIUS,
  isHexColor,
  suggestBrandPair,
  type BrandPairSuggestion,
  type TenantTheme,
  type ThemeName,
} from "@nexus/ui-core";
import { isValidAssetInput } from "./AssetsPanel";

export const PX_PATTERN = /^\d+(\.\d+)?px$/;

export interface ThemeDraft {
  readonly light: Record<string, string>;
  readonly dark: Record<string, string>;
  readonly fonts: { readonly sans: string | null; readonly mono: string | null };
  readonly radius: Record<string, string>;
  readonly density: Density | null;
  readonly logoUrl: string;
  readonly faviconUrl: string;
  readonly loginImageUrl: string | null;
}

export interface InheritedTheme {
  readonly light: Record<string, string>;
  readonly dark: Record<string, string>;
  readonly fonts: { readonly sans: string | null; readonly mono: string | null };
  readonly radius: Record<string, string>;
  readonly density: Density | null;
  readonly assets: { readonly logoUrl: string | null; readonly faviconUrl: string | null };
  readonly locked: ReadonlySet<string>;
}

export function computeInherited(layers: readonly Theme[]): InheritedTheme {
  const outer = layers.filter((l) => l.scope.kind === "platform" || l.scope.kind === "group");
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  const radius: Record<string, string> = {};
  const locked = new Set<string>();
  let sans: string | null = null;
  let mono: string | null = null;
  let density: Density | null = null;
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;

  for (const layer of outer) {
    for (const [k, v] of Object.entries(layer.light)) if (!locked.has(k)) light[k] = v;
    for (const [k, v] of Object.entries(layer.dark)) if (!locked.has(k)) dark[k] = v;
    for (const [k, v] of Object.entries(layer.radius)) if (!locked.has(k)) radius[k] = v;
    sans = layer.fonts.sans ?? sans;
    mono = layer.fonts.mono ?? mono;
    density = layer.density ?? density;
    logoUrl = layer.assets.logoUrl ?? logoUrl;
    faviconUrl = layer.assets.faviconUrl ?? faviconUrl;
    for (const token of layer.lockedTokens) locked.add(token);
  }
  return {
    light,
    dark,
    fonts: { sans, mono },
    radius,
    density,
    assets: { logoUrl, faviconUrl },
    locked,
  };
}

export function draftFromLayer(layer: Theme): ThemeDraft {
  return {
    light: { ...layer.light },
    dark: { ...layer.dark },
    fonts: { sans: layer.fonts.sans, mono: layer.fonts.mono },
    radius: { ...layer.radius },
    density: layer.density,
    logoUrl: layer.assets.logoUrl ?? "",
    faviconUrl: layer.assets.faviconUrl ?? "",
    loginImageUrl: layer.assets.loginImageUrl,
  };
}

export function validColors(map: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (isHexColor(v)) out[k] = v.toUpperCase();
  }
  return out;
}

export function validRadii(map: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    const trimmed = v.trim();
    if (PX_PATTERN.test(trimmed)) out[k] = trimmed;
  }
  return out;
}

export function syncKeyOf(data: ThemeResponse | undefined): string {
  const inst = data?.layers.find((l) => l.scope.kind === "institution");
  return inst ? `${inst.id}:${inst.version}` : "";
}

export function hasDraftFieldErrors(draft: ThemeDraft | null): boolean {
  if (!draft) return false;
  const badColor = [...Object.values(draft.light), ...Object.values(draft.dark)].some(
    (v) => !isHexColor(v),
  );
  const badRadius = Object.values(draft.radius).some((v) => !PX_PATTERN.test(v.trim()));
  return (
    badColor ||
    badRadius ||
    !isValidAssetInput(draft.logoUrl) ||
    !isValidAssetInput(draft.faviconUrl)
  );
}

export function buildPreviewTheme(
  effectiveColors: Readonly<Record<ThemeName, Readonly<Record<string, string>>>>,
  draft: ThemeDraft | null,
  inherited: InheritedTheme,
): TenantTheme {
  return {
    light: effectiveColors.light,
    dark: effectiveColors.dark,
    fonts: {
      sans: draft?.fonts.sans ?? inherited.fonts.sans ?? DEFAULT_FONTS.sans,
      mono: draft?.fonts.mono ?? inherited.fonts.mono ?? DEFAULT_FONTS.mono,
    },
    radius: { ...DEFAULT_RADIUS, ...inherited.radius, ...validRadii(draft?.radius ?? {}) },
    density: draft?.density ?? inherited.density ?? "comfortable",
  };
}

export function computeBrandSuggestion(
  draft: ThemeDraft | null,
  edited: boolean,
  modeColors: Readonly<Record<string, string>>,
  locked: ReadonlySet<string>,
): BrandPairSuggestion | null {
  if (!draft || !edited) return null;
  const primary = modeColors["brand-primary"];
  if (!primary || !isHexColor(primary)) return null;
  const pair = suggestBrandPair(primary, modeColors);
  const curOnBrand = modeColors["on-brand"]?.toUpperCase();
  const curText = modeColors["brand-primary-text"]?.toUpperCase();
  const canFixOnBrand = !locked.has("on-brand") && pair.onBrand !== curOnBrand;
  const canFixText = !locked.has("brand-primary-text") && pair.brandPrimaryText !== curText;
  return canFixOnBrand || canFixText ? pair : null;
}

export function toUpdatePayload(draft: ThemeDraft): ThemeUpdateInput {
  return {
    light: validColors(draft.light),
    dark: validColors(draft.dark),
    fonts: draft.fonts,
    radius: validRadii(draft.radius),
    density: draft.density,
    assets: {
      logoUrl: draft.logoUrl.trim() || null,
      faviconUrl: draft.faviconUrl.trim() || null,
      loginImageUrl: draft.loginImageUrl,
    },
  };
}

export function resetColorInDraft(
  draft: ThemeDraft,
  inherited: InheritedTheme,
  mode: ThemeName,
  token: string,
): ThemeDraft {
  const platformDefault = DEFAULT_COLORS[mode][token];
  if (!platformDefault) return draft;
  const next = { ...draft[mode] };
  if (inherited[mode][token] && inherited[mode][token] !== platformDefault) {
    next[token] = platformDefault;
  } else {
    delete next[token];
  }
  return { ...draft, [mode]: next };
}

export function resetRadiusInDraft(
  draft: ThemeDraft,
  inherited: InheritedTheme,
  token: string,
): ThemeDraft {
  const next = { ...draft.radius };
  const def = DEFAULT_RADIUS[token];
  if (def && inherited.radius[token] && inherited.radius[token] !== def) {
    next[token] = def;
  } else {
    delete next[token];
  }
  return { ...draft, radius: next };
}

export function applyBrandSuggestionToDraft(
  draft: ThemeDraft,
  mode: ThemeName,
  suggestion: BrandPairSuggestion,
  locked: ReadonlySet<string>,
): ThemeDraft {
  const next = { ...draft[mode] };
  if (!locked.has("on-brand")) next["on-brand"] = suggestion.onBrand;
  if (!locked.has("brand-primary-text")) next["brand-primary-text"] = suggestion.brandPrimaryText;
  return { ...draft, [mode]: next };
}

export function resolveDraftColors(draft: ThemeDraft | null, inherited: InheritedTheme) {
  return {
    effective: {
      light: { ...DEFAULT_COLORS.light, ...inherited.light, ...validColors(draft?.light ?? {}) },
      dark: { ...DEFAULT_COLORS.dark, ...inherited.dark, ...validColors(draft?.dark ?? {}) },
    },
    display: {
      light: { ...DEFAULT_COLORS.light, ...inherited.light, ...(draft?.light ?? {}) },
      dark: { ...DEFAULT_COLORS.dark, ...inherited.dark, ...(draft?.dark ?? {}) },
    },
  };
}
