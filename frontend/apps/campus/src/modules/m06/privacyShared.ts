import type {
  AuditEvent,
  CompliancePackCode,
  ConsentMethod,
  ConsentPurpose,
  ConsentStatus,
  DsrKind,
  DsrStatus,
} from "@nexus/contracts";
import {
  formatDate,
  formatDateTime,
  isPseudoLocale,
  SOURCE_LOCALE,
  type MessageKey,
} from "@nexus/i18n";
import { usePeople, useUsers } from "@nexus/services";
import { useMemo } from "react";

export const PURPOSE_KEY: Readonly<Record<ConsentPurpose, MessageKey>> = {
  ai_features: "m06.purpose.aiFeatures",
  media_sharing: "m06.purpose.mediaSharing",
  marketing: "m06.purpose.marketing",
  data_processing: "m06.purpose.dataProcessing",
};

export const CONSENT_STATUS_KEY: Readonly<Record<ConsentStatus, MessageKey>> = {
  granted: "m06.consentStatus.granted",
  withdrawn: "m06.consentStatus.withdrawn",
  pending: "m06.consentStatus.pending",
};

export const CONSENT_TONE: Readonly<Record<ConsentStatus, "success" | "neutral" | "warning">> = {
  granted: "success",
  withdrawn: "neutral",
  pending: "warning",
};

export const METHOD_KEY: Readonly<Record<ConsentMethod, MessageKey>> = {
  form: "m06.method.form",
  digital_signature: "m06.method.digitalSignature",
  in_app: "m06.method.inApp",
  paper: "m06.method.paper",
};

export const DSR_KIND_KEY: Readonly<Record<DsrKind, MessageKey>> = {
  access: "m06.dsrKind.access",
  correct: "m06.dsrKind.correct",
  delete: "m06.dsrKind.delete",
  export: "m06.dsrKind.export",
};

export const DSR_STATUS_KEY: Readonly<Record<DsrStatus, MessageKey>> = {
  received: "m06.dsrStatus.received",
  in_progress: "m06.dsrStatus.inProgress",
  completed: "m06.dsrStatus.completed",
  rejected: "m06.dsrStatus.rejected",
};

export const DSR_TONE: Readonly<Record<DsrStatus, "info" | "brand" | "success" | "neutral">> = {
  received: "info",
  in_progress: "brand",
  completed: "success",
  rejected: "neutral",
};

export const PACK_KEY: Readonly<Record<CompliancePackCode, MessageKey>> = {
  gdpr: "m06.pack.gdpr",
  uk_gdpr: "m06.pack.ukGdpr",
  ferpa: "m06.pack.ferpa",
  coppa: "m06.pack.coppa",
  dpdp: "m06.pack.dpdp",
  lgpd: "m06.pack.lgpd",
  popia: "m06.pack.popia",
  pdpa: "m06.pack.pdpa",
  eu_ai_act: "m06.pack.euAiAct",
};

const formatLocale = (locale: string) => (isPseudoLocale(locale) ? SOURCE_LOCALE : locale);

export function when(value: string, locale: string, timeZone: string): string {
  return formatDateTime(value, { locale: formatLocale(locale), timeZone });
}

export function day(value: string, locale: string, timeZone: string): string {
  return formatDate(value, { locale: formatLocale(locale), timeZone });
}

/** Person and user display names (people come masked per G-6; names are not restricted). */
export function useNames(withUsers: boolean) {
  const people = usePeople();
  const users = useUsers(withUsers);
  return useMemo(() => {
    const person = new Map<string, string>();
    for (const p of people.data?.items ?? []) person.set(p.id, p.preferredName ?? p.legalName);
    const user = new Map<string, string>();
    for (const u of users.data?.items ?? []) user.set(u.id, person.get(u.personId) ?? u.email);
    return { person, user };
  }, [people.data, users.data]);
}

/**
 * Client-side "page check" of the hash chain: each event's `prevHash` must equal the hash of the event
 * before it. Returns the 1-based row of the first broken link, or `null` when the page is intact.
 */
export function firstBrokenLink(events: readonly AuditEvent[]): number | null {
  for (let i = 1; i < events.length; i += 1) {
    if (events[i]!.prevHash !== events[i - 1]!.hash) return i + 1;
  }
  return null;
}
