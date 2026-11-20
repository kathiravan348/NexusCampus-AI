import type { TextOverride } from "@nexus/contracts";
import {
  I18nProvider,
  PSEUDO_LOCALE,
  SOURCE_LOCALE,
  useText,
  type TextOverrides,
} from "@nexus/i18n";
import {
  useLocaleSettings,
  useMe,
  useSession,
  useTenant,
  useTextBundle,
  type TextBundle,
  useTheme,
  type EffectiveTheme,
} from "@nexus/services";
import {
  applyTenantTheme,
  applyTheme,
  getStoredTheme,
  resetTenantTheme,
  type TenantTheme,
  type ThemeName,
} from "@nexus/ui-core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const LOCALE_STORAGE_KEY = "nexus.locale";

export interface RuntimeContextValue {
  readonly locale: string;
  /** Locales the user may pick: the institution's, plus the pseudo-locale in dev. */
  readonly supportedLocales: readonly string[];
  setLocale(locale: string): void;
  readonly timeZone: string;
  readonly mode: ThemeName;
  setMode(mode: ThemeName): void;
  readonly tenantName: string | null;
  readonly logoUrl: string | null;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function useRuntime(): RuntimeContextValue {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("useRuntime must be used inside <TenantRuntime>");
  return value;
}

function readPicks(): Readonly<Record<string, string>> {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writePicks(picks: Readonly<Record<string, string>>): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(picks));
  } catch {
    // Not remembered; the pick still applies in this tab.
  }
}

/** The services theme shape → the theme engine's (`null` font = platform default). */
export function toTenantTheme(effective: EffectiveTheme): TenantTheme {
  return {
    light: effective.light,
    dark: effective.dark,
    fonts: {
      ...(effective.fonts.sans ? { sans: effective.fonts.sans } : {}),
      ...(effective.fonts.mono ? { mono: effective.fonts.mono } : {}),
    },
    radius: effective.radius,
    ...(effective.density ? { density: effective.density } : {}),
  };
}

/** Group, institution and campus override layers for one user scope (C-2). */
export function overrideLayers(
  overrides: readonly TextOverride[],
  institutionId: string | null,
  campusId: string | null = null,
): { group: TextOverrides; institution: TextOverrides; campus: TextOverrides } {
  const group: Record<string, string> = {};
  const institution: Record<string, string> = {};
  const campus: Record<string, string> = {};
  for (const o of overrides) {
    if (o.scope.kind === "group") group[o.key] = o.message;
    else if (o.scope.kind === "institution" && o.scope.targetId === institutionId) {
      institution[o.key] = o.message;
    } else if (o.scope.kind === "campus" && campusId !== null && o.scope.targetId === campusId) {
      campus[o.key] = o.message;
    }
  }
  return { group, institution, campus };
}

/** The layers of a compiled text bundle for one institution (and campus). */
export function bundleLayers(
  bundle: TextBundle | null,
  institutionId: string | null,
  campusId: string | null = null,
): { group: TextOverrides; institution: TextOverrides; campus: TextOverrides } {
  return {
    group: bundle?.group ?? {},
    institution: (institutionId && bundle?.institutions[institutionId]) || {},
    campus: (campusId && bundle?.campuses[campusId]) || {},
  };
}

/** Applies the signed-in tenant's theme, locale, terminology and text overrides (C-1, C-2, G-1). */
export function TenantRuntime({ children }: { readonly children: ReactNode }) {
  const { session } = useSession();
  const me = useMe();
  const tenant = useTenant();
  const settings = useLocaleSettings();
  const campusId =
    me.data?.assignments.find((a) => a.scope.kind === "campus")?.scope.targetId ?? null;
  const theme = useTheme(campusId);
  const [picks, setPicks] = useState<Readonly<Record<string, string>>>(readPicks);
  const [mode, setModeState] = useState<ThemeName>(getStoredTheme);

  const tenantId = session?.tenantId ?? null;
  const pick = tenantId ? (picks[tenantId] ?? null) : null;
  const institution = tenant.data?.institutions[0] ?? null;
  const supportedLocales = useMemo<readonly string[]>(() => {
    if (!settings.data) return [];
    const list = [...settings.data.supportedLocales];
    if (import.meta.env.DEV) list.push(PSEUDO_LOCALE);
    return list;
  }, [settings.data]);

  const locale =
    session && settings.data
      ? pick !== null && supportedLocales.includes(pick)
        ? pick
        : settings.data.defaultLocale
      : SOURCE_LOCALE;
  const timeZone = settings.data?.timeZone ?? "UTC";

  const bundle = useTextBundle(locale);
  const layers = useMemo(
    () => bundleLayers(bundle.data ?? null, institution?.id ?? null, campusId),
    [bundle.data, institution?.id, campusId],
  );

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    if (!session || !theme.data) {
      resetTenantTheme();
      return;
    }
    try {
      applyTenantTheme(toTenantTheme(theme.data.effective));
    } catch (error) {
      // An invalid theme never breaks the app: Nexus Style applies instead.
      resetTenantTheme();
      console.warn("Tenant theme not applied", error);
    }
  }, [session, theme.data]);

  const setLocale = useCallback(
    (next: string) => {
      if (!tenantId) return;
      setPicks((prev) => {
        const updated = { ...prev, [tenantId]: next };
        writePicks(updated);
        return updated;
      });
    },
    [tenantId],
  );

  const value = useMemo<RuntimeContextValue>(
    () => ({
      locale,
      supportedLocales,
      setLocale,
      timeZone,
      mode,
      setMode: setModeState,
      tenantName: tenant.data?.group?.name ?? institution?.name ?? null,
      logoUrl: theme.data?.effective.assets.logoUrl ?? null,
    }),
    [locale, supportedLocales, setLocale, timeZone, mode, tenant.data, institution, theme.data],
  );

  const waiting = session !== null && (tenant.isPending || settings.isPending);
  return (
    <RuntimeContext.Provider value={value}>
      <I18nProvider
        locale={locale}
        {...(institution ? { typePack: institution.type } : {})}
        group={layers.group}
        institution={layers.institution}
        campus={layers.campus}
      >
        {waiting && !tenant.isError && !settings.isError ? <RuntimeLoading /> : children}
      </I18nProvider>
    </RuntimeContext.Provider>
  );
}

function RuntimeLoading() {
  const t = useText();
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-bg-ground text-body text-text-secondary"
    >
      {t("common.loading")}
    </div>
  );
}
