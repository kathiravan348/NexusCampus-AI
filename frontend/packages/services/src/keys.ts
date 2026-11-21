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
    /** Prefix of every M02 list below; invalidated after each M02 write. */
    all: (s: KeyScope) => scoped(s, "m02"),
    people: (s: KeyScope) => scoped(s, "m02", "people"),
    users: (s: KeyScope) => scoped(s, "m02", "users"),
    roles: (s: KeyScope) => scoped(s, "m02", "roles"),
    permissions: (s: KeyScope) => scoped(s, "m02", "permissions"),
    assignments: (s: KeyScope) => scoped(s, "m02", "assignments"),
    sessions: (s: KeyScope) => scoped(s, "m02", "sessions"),
    ssoProviders: (s: KeyScope) => scoped(s, "m02", "sso-providers"),
  },
  m03: {
    theme: (s: KeyScope, campusId: string | null) => scoped(s, "m03", "theme", campusId),
    fonts: (s: KeyScope) => scoped(s, "m03", "fonts"),
  },
  m04: {
    textOverrides: (s: KeyScope, locale: string) => scoped(s, "m04", "text-overrides", locale),
    revisions: (s: KeyScope, key: string | null, locale: string | null = null) =>
      scoped(s, "m04", "revisions", key, locale),
  },
  m06: {
    /** Prefix of every M06 query below; invalidated after each M06 write. */
    all: (s: KeyScope) => scoped(s, "m06"),
    audit: (s: KeyScope, filters: unknown, page: number, pageSize: number) =>
      scoped(s, "m06", "audit", filters, page, pageSize),
    consents: (s: KeyScope) => scoped(s, "m06", "consents"),
    dataRequests: (s: KeyScope) => scoped(s, "m06", "data-requests"),
    compliancePacks: (s: KeyScope) => scoped(s, "m06", "compliance-packs"),
  },
  m10: {
    all: (s: KeyScope) => scoped(s, "m10"),
    devices: (s: KeyScope) => scoped(s, "m10", "devices"),
    conflicts: (s: KeyScope) => scoped(s, "m10", "conflicts"),
  },
  m11: {
    all: (s: KeyScope) => scoped(s, "m11"),
    settings: (s: KeyScope) => scoped(s, "m11", "settings"),
    credits: (s: KeyScope) => scoped(s, "m11", "credits"),
  },
  m83: {
    all: (s: KeyScope) => scoped(s, "m83"),
    keys: (s: KeyScope) => scoped(s, "m83", "keys"),
    requests: (s: KeyScope) => scoped(s, "m83", "requests"),
    grants: (s: KeyScope) => scoped(s, "m83", "grants"),
    breakGlass: (s: KeyScope) => scoped(s, "m83", "break-glass"),
    history: (s: KeyScope, grantId: string | null) => scoped(s, "m83", "history", grantId),
  },
  m84: {
    all: (s: KeyScope) => scoped(s, "m84"),
    status: (s: KeyScope) => scoped(s, "m84", "status"),
    update: (s: KeyScope) => scoped(s, "m84", "update"),
    backups: (s: KeyScope) => scoped(s, "m84", "backups"),
    diagnostics: (s: KeyScope) => scoped(s, "m84", "diagnostics"),
  },
  m07: {
    templates: (s: KeyScope) => scoped(s, "m07", "templates"),
    deliveries: (s: KeyScope, page: number, pageSize: number, filters: unknown) =>
      scoped(s, "m07", "deliveries", page, pageSize, filters),
    preferences: (s: KeyScope) => scoped(s, "m07", "preferences"),
  },
  m05: {
    plan: (s: KeyScope) => scoped(s, "m05", "plan"),
    entitlements: (s: KeyScope) => scoped(s, "m05", "entitlements"),
    usage: (s: KeyScope) => scoped(s, "m05", "usage"),
  },
} as const;
