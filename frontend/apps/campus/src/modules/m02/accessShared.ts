import type { RoleScope, ScopeKind, UserStatus } from "@nexus/contracts";
import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, type MessageKey } from "@nexus/i18n";
import type { TenantResponse } from "@nexus/services";

export const SCOPE_KEY: Readonly<Record<ScopeKind, MessageKey>> = {
  group: "m02.scope.group",
  institution: "m02.scope.institution",
  campus: "m02.scope.campus",
  department: "m02.scope.department",
  class: "m02.scope.class",
  own: "m02.scope.own",
};

export const STATUS_KEY: Readonly<Record<UserStatus, MessageKey>> = {
  invited: "m02.users.status.invited",
  active: "m02.users.status.active",
  suspended: "m02.users.status.suspended",
  locked: "m02.users.status.locked",
};

export const STATUS_TONE: Readonly<Record<UserStatus, "info" | "success" | "warning" | "danger">> =
  {
    invited: "info",
    active: "success",
    suspended: "warning",
    locked: "danger",
  };

/** Targets the scope picker can offer for a kind; department and class come with Stage 3. */
export function scopeTargets(
  kind: ScopeKind,
  tenant: TenantResponse | undefined,
): { value: string; label: string }[] {
  if (!tenant) return [];
  if (kind === "group")
    return tenant.group ? [{ value: tenant.group.id, label: tenant.group.name }] : [];
  if (kind === "institution")
    return tenant.institutions.map((i) => ({ value: i.id, label: i.name }));
  if (kind === "campus") return tenant.campuses.map((c) => ({ value: c.id, label: c.name }));
  return [];
}

/** Scope kinds a picker can actually fill in Stage 1 (needs a target, or is `own`). */
export function pickableKinds(
  allowed: readonly ScopeKind[],
  tenant: TenantResponse | undefined,
): ScopeKind[] {
  return allowed.filter((k) => k === "own" || scopeTargets(k, tenant).length > 0);
}

export function scopeOf(kind: ScopeKind, targetId: string): RoleScope {
  return kind === "own" ? { kind, targetId: null } : { kind, targetId };
}

/** "Campus · Riverside North" style label for an assignment scope. */
export function scopeLabel(
  scope: RoleScope,
  tenant: TenantResponse | undefined,
  kindLabel: string,
): string {
  if (scope.targetId === null) return kindLabel;
  const target = scopeTargets(scope.kind, tenant).find((o) => o.value === scope.targetId);
  return `${kindLabel} · ${target?.label ?? scope.targetId}`;
}

export function formatWhen(value: string, locale: string, timeZone: string): string {
  return formatDateTime(value, {
    locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
    timeZone,
  });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
