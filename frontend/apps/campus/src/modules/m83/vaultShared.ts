import type {
  AccessGrant,
  AccessMode,
  AccessRequestStatus,
  BreakGlassCategory,
  KeyCustody,
  KeyPurpose,
  KeyState,
} from "@nexus/contracts";
import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, type MessageKey } from "@nexus/i18n";

export const MODULE_KEY: Readonly<Record<string, MessageKey>> = {
  M01: "m05.module.m01",
  M02: "m05.module.m02",
  M03: "m05.module.m03",
  M04: "m05.module.m04",
  M05: "m05.module.m05",
  M06: "m05.module.m06",
  M07: "m05.module.m07",
  M10: "m05.module.m10",
  M11: "m05.module.m11",
  M83: "m05.module.m83",
};

export const MODE_KEY: Readonly<Record<AccessMode, MessageKey>> = {
  read: "m83.mode.read",
  edit: "m83.mode.edit",
};

export const REQUEST_STATUS_KEY: Readonly<Record<AccessRequestStatus, MessageKey>> = {
  pending: "m83.requestStatus.pending",
  approved: "m83.requestStatus.approved",
  denied: "m83.requestStatus.denied",
  expired: "m83.requestStatus.expired",
  revoked: "m83.requestStatus.revoked",
};

export const REQUEST_TONE: Readonly<
  Record<AccessRequestStatus, "warning" | "success" | "neutral" | "danger">
> = {
  pending: "warning",
  approved: "success",
  denied: "neutral",
  expired: "neutral",
  revoked: "danger",
};

export const PURPOSE_KEY: Readonly<Record<KeyPurpose, MessageKey>> = {
  tenant_data: "m83.keyPurpose.tenantData",
  field_health: "m83.keyPurpose.fieldHealth",
  field_identity: "m83.keyPurpose.fieldIdentity",
  field_finance: "m83.keyPurpose.fieldFinance",
};

export const CUSTODY_KEY: Readonly<Record<KeyCustody, MessageKey>> = {
  platform: "m83.custody.platform",
  byok: "m83.custody.byok",
  hyok: "m83.custody.hyok",
};

export const KEY_STATE_KEY: Readonly<Record<KeyState, MessageKey>> = {
  active: "m83.keyState.active",
  rotating: "m83.keyState.rotating",
  revoked: "m83.keyState.revoked",
  destroyed: "m83.keyState.destroyed",
};

export const CATEGORY_KEY: Readonly<Record<BreakGlassCategory, MessageKey>> = {
  legal_order: "m83.breakGlass.legalOrder",
  security_incident: "m83.breakGlass.securityIncident",
};

export function when(value: string, locale: string, timeZone: string): string {
  return formatDateTime(value, {
    locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
    timeZone,
  });
}

export type GrantState = "active" | "ended" | "revoked";

export function grantState(g: AccessGrant, now: number): GrantState {
  if (g.revokedAt !== null) return "revoked";
  return Date.parse(g.endsAt) > now ? "active" : "ended";
}

/** Whole hours and minutes left until `endsAt` (never negative). */
export function timeLeft(endsAt: string, now: number): { hours: number; minutes: number } {
  const ms = Math.max(0, Date.parse(endsAt) - now);
  return { hours: Math.floor(ms / 3_600_000), minutes: Math.floor((ms % 3_600_000) / 60_000) };
}
