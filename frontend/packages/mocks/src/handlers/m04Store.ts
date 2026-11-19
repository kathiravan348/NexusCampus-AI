import {
  AuditEventSchema,
  LocaleSchema,
  MessageKeySchema,
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  type ApiErrorDetail,
  type AuditEvent,
  type TextOverride,
  type TextOverrideRevision,
} from "@nexus/contracts";
import { isKnownMessageKey, isValidMessage } from "@nexus/i18n/resolve";
import { z } from "zod";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { auditHashInput } from "../fixtures/audit";
import { found } from "./route";

export const M04_MODULE = "M04" as const;
export const M04_MANAGE = "m04.text.manage";
export const MessageBodySchema = z.string().trim().min(1).max(5000);

export const TextOverrideSaveInputSchema = z.strictObject({ message: MessageBodySchema });
export const TextOverrideDeleteResponseSchema = z.strictObject({
  deleted: z.literal(true),
  key: MessageKeySchema,
  locale: LocaleSchema,
  version: z.int().min(1),
});
export const TextOverrideRollbackInputSchema = z.strictObject({ version: z.int().min(1) });
export const TextOverrideRollbackResponseSchema = z.strictObject({
  override: TextOverrideSchema.nullable(),
  revision: TextOverrideRevisionSchema,
});
export const ImportRejectionReasonSchema = z.enum([
  "unknown_key",
  "invalid_icu",
  "empty_message",
  "locked_by_group",
  "invalid_value",
]);
export const ImportDiffEntrySchema = z.strictObject({
  key: z.string(),
  before: z.string().nullable(),
  after: z.string(),
});
export const ImportRejectedEntrySchema = z.strictObject({
  key: z.string(),
  reason: ImportRejectionReasonSchema,
  message: z.string(),
});
export const TextOverrideImportInputSchema = z.strictObject({
  locale: LocaleSchema,
  entries: z.record(z.string(), z.unknown()),
  dryRun: z.boolean().default(false),
});
export const TextOverrideImportResultSchema = z.strictObject({
  dryRun: z.boolean(),
  locale: LocaleSchema,
  added: z.array(ImportDiffEntrySchema),
  changed: z.array(ImportDiffEntrySchema),
  unchanged: z.array(z.string()),
  rejected: z.array(ImportRejectedEntrySchema),
  appliedCount: z.int().min(0),
});

export interface ArchivedMeta {
  readonly id: string;
  readonly tenantId: string;
  readonly locale: string;
  readonly key: string;
}

/** Keyed by `mockDb.textOverrideRevisions` so `resetMockDb()` automatically resets it. */
const archivedByDb = new WeakMap<TextOverrideRevision[], Map<string, ArchivedMeta>>();
export const archiveKey = (tenantId: string, locale: string, key: string) =>
  `${tenantId}\0${locale}\0${key}`;

export function archiveMap(): Map<string, ArchivedMeta> {
  let map = archivedByDb.get(mockDb.textOverrideRevisions);
  if (!map) {
    map = new Map();
    archivedByDb.set(mockDb.textOverrideRevisions, map);
  }
  return map;
}

export function tenantInstitutionId(tenantId: string): string {
  return found(ofTenant(mockDb.institutions, tenantId)[0]).id;
}

export function hasGroupLock(tenantId: string, locale: string, key: string): boolean {
  return ofTenant(mockDb.textOverrides, tenantId).some(
    (o) => o.scope.kind === "group" && o.locale === locale && o.key === key,
  );
}

export function findInstitutionOverride(
  tenantId: string,
  locale: string,
  key: string,
): TextOverride | undefined {
  return ofTenant(mockDb.textOverrides, tenantId).find(
    (o) => o.scope.kind === "institution" && o.locale === locale && o.key === key,
  );
}

export function maxRevisionVersion(overrideId: string): number {
  let max = 0;
  for (const r of mockDb.textOverrideRevisions) {
    if (r.overrideId === overrideId && r.version > max) max = r.version;
  }
  return max;
}

export function upsertInstitutionOverride(
  viewer: Viewer,
  locale: string,
  key: string,
  message: string,
): { override: TextOverride; revision: TextOverrideRevision } {
  const now = new Date().toISOString();
  const overrides = mockDb.textOverrides as TextOverride[];
  const existing = findInstitutionOverride(viewer.tenantId, locale, key);
  const archived = archiveMap().get(archiveKey(viewer.tenantId, locale, key));
  const id = existing?.id ?? archived?.id ?? `tov-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const version = Math.max(existing?.version ?? 0, maxRevisionVersion(id)) + 1;
  const saved = TextOverrideSchema.parse({
    id,
    tenantId: viewer.tenantId,
    scope: { kind: "institution", targetId: tenantInstitutionId(viewer.tenantId) },
    locale,
    key,
    message,
    version,
    updatedBy: viewer.userId,
    updatedAt: now,
  });
  if (existing) overrides[overrides.findIndex((o) => o.id === existing.id)] = saved;
  else overrides.push(saved);
  archiveMap().delete(archiveKey(viewer.tenantId, locale, key));

  const revision = TextOverrideRevisionSchema.parse({
    overrideId: id,
    version,
    message,
    changedBy: viewer.userId,
    changedAt: now,
  });
  mockDb.textOverrideRevisions.push(revision);
  return { override: saved, revision };
}

export function evaluateImportEntries(
  tenantId: string,
  locale: string,
  entries: Readonly<Record<string, unknown>>,
) {
  const added: z.infer<typeof ImportDiffEntrySchema>[] = [];
  const changed: z.infer<typeof ImportDiffEntrySchema>[] = [];
  const unchanged: string[] = [];
  const rejected: z.infer<typeof ImportRejectedEntrySchema>[] = [];

  for (const [key, rawValue] of Object.entries(entries)) {
    if (!isKnownMessageKey(key)) {
      rejected.push({ key, reason: "unknown_key", message: `Unknown message key: ${key}` });
    } else if (typeof rawValue !== "string") {
      rejected.push({ key, reason: "invalid_value", message: "Value must be a string" });
    } else if (!MessageBodySchema.safeParse(rawValue).success) {
      rejected.push({ key, reason: "empty_message", message: "Message cannot be empty" });
    } else if (!isValidMessage(rawValue.trim())) {
      rejected.push({ key, reason: "invalid_icu", message: "Invalid ICU message syntax" });
    } else if (hasGroupLock(tenantId, locale, key)) {
      rejected.push({ key, reason: "locked_by_group", message: "Locked by a group override" });
    } else {
      const after = rawValue.trim();
      const existing = findInstitutionOverride(tenantId, locale, key);
      if (existing?.message === after) unchanged.push(key);
      else if (existing) changed.push({ key, before: existing.message, after });
      else added.push({ key, before: null, after });
    }
  }
  return { added, changed, unchanged, rejected };
}

export function requireLocaleAndKey(url: URL, rawKey: unknown): { locale: string; key: string } {
  const key = typeof rawKey === "string" ? decodeURIComponent(rawKey) : "";
  const locale = url.searchParams.get("locale")?.trim() ?? "";
  const bad: ApiErrorDetail[] = [];
  if (!LocaleSchema.safeParse(locale).success) {
    bad.push({ path: "locale", message: `Invalid or missing locale: ${locale}` });
  }
  if (!isKnownMessageKey(key)) bad.push({ path: "key", message: `Unknown message key: ${key}` });
  if (bad.length > 0) throw new ApiFailure("invalid_request", bad);
  return { locale, key };
}

export async function appendM04Audit(
  viewer: Viewer,
  action: string,
  targetId: string,
): Promise<void> {
  const tenantEvents = ofTenant(mockDb.auditEvents, viewer.tenantId);
  const prevHash = tenantEvents[tenantEvents.length - 1]?.hash ?? null;
  const id = `aud-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const occurredAt = new Date().toISOString();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(auditHashInput({ id, occurredAt, action, prevHash })),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const event: AuditEvent = AuditEventSchema.parse({
    id,
    tenantId: viewer.tenantId,
    occurredAt,
    actorKind: "user",
    actorId: viewer.userId,
    grantId: null,
    action,
    moduleId: M04_MODULE,
    targetType: "textOverride",
    targetId,
    deviceId: null,
    changes: [{ field: "message", sensitive: false }],
    prevHash,
    hash,
  });
  mockDb.auditEvents.push(event);
}
