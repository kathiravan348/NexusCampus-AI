import type { QueryKey } from "@tanstack/react-query";

/** Tenant + user every scoped key starts with, so one user's cache never serves another (O-3). */
export interface KeyScope {
  readonly tenantId: string;
  readonly userId: string;
}

const scoped = (s: KeyScope, ...rest: readonly unknown[]): QueryKey => [
  "t",
  s.tenantId,
  "u",
  s.userId,
  ...rest,
];

/** One factory for every query key; screens never write keys by hand. */
export const queryKeys = {
  /** Prefix of everything one user may see; invalidate it to refetch all. */
  scope: (s: KeyScope): QueryKey => scoped(s),
  /** Demo sign-in list: shown before anyone signs in, so it is the one key without a scope. */
  demoTenants: (): QueryKey => ["public", "m01", "demo-tenants"],
  m01: {
    tenant: (s: KeyScope) => scoped(s, "m01", "tenant"),
    institutionProfile: (s: KeyScope, institutionId: string) =>
      scoped(s, "m01", "institution-profile", institutionId),
    calendars: (s: KeyScope, institutionId: string) => scoped(s, "m01", "calendars", institutionId),
    localeSettings: (s: KeyScope, institutionId: string | null) =>
      scoped(s, "m01", "locale-settings", institutionId),
  },
  m02: {
    me: (s: KeyScope) => scoped(s, "m02", "me"),
  },
  m03: {
    theme: (s: KeyScope, campusId: string | null) => scoped(s, "m03", "theme", campusId),
    fonts: (s: KeyScope) => scoped(s, "m03", "fonts"),
  },
  m04: {
    textOverrides: (s: KeyScope, locale: string) => scoped(s, "m04", "text-overrides", locale),
  },
  m05: {
    plan: (s: KeyScope) => scoped(s, "m05", "plan"),
    entitlements: (s: KeyScope) => scoped(s, "m05", "entitlements"),
    usage: (s: KeyScope) => scoped(s, "m05", "usage"),
  },
} as const;
