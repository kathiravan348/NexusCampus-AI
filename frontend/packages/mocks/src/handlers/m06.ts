import {
  AuditEventSchema,
  CompliancePackSchema,
  ConsentSchema,
  DataSubjectRequestSchema,
  UtcDateTimeSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, familyOf, ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list, param } from "./route";

const M = "M06";
const AUDIT_READ = "m06.audit.read";

/** `?from=` / `?to=` as UTC instants; 400 `invalid_request` when not. */
function instant(url: URL, key: "from" | "to"): number | null {
  const value = param(url, key);
  if (value === null) return null;
  const parsed = UtcDateTimeSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiFailure("invalid_request", [
      { path: key, message: "Must be a UTC date-time, e.g. 2026-09-01T00:00:00Z" },
    ]);
  }
  return Date.parse(parsed.data);
}

export const m06Handlers = [
  /** Filters: `action`, `actorId`, `grantId` (exact) and `from` / `to` (inclusive, on `occurredAt`). */
  get("/audit-events", { module: M, permission: AUDIT_READ }, (ctx) => {
    const [action, actorId, grantId] = ["action", "actorId", "grantId"].map((k) =>
      param(ctx.url, k),
    );
    const from = instant(ctx.url, "from");
    const to = instant(ctx.url, "to");
    const events = ofTenant(mockDb.auditEvents, ctx.viewer.tenantId).filter((e) => {
      const at = Date.parse(e.occurredAt);
      return (
        (action === null || e.action === action) &&
        (actorId === null || e.actorId === actorId) &&
        (grantId === null || e.grantId === grantId) &&
        (from === null || at >= from) &&
        (to === null || at <= to)
      );
    });
    return list(ctx, events, pageSchema(AuditEventSchema));
  }),

  /** Staff with `m02.user.read` see all consents; a guardian only their own family's. */
  get("/consents", { module: M, permission: "m06.consent.manage" }, (ctx) => {
    const consents = ofTenant(mockDb.consents, ctx.viewer.tenantId);
    const family = familyOf(ctx.viewer);
    const visible = ctx.viewer.permissions.has("m02.user.read")
      ? consents
      : consents.filter((c) => family.has(c.personId));
    return list(ctx, visible, pageSchema(ConsentSchema));
  }),

  get("/data-requests", { module: M, permission: "m06.request.manage" }, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.dataRequests, ctx.viewer.tenantId),
      pageSchema(DataSubjectRequestSchema),
    ),
  ),

  /** The compliance packs that apply to this tenant. */
  get("/compliance-packs", { module: M, permission: AUDIT_READ }, (ctx) => {
    const codes = new Set(mockDb.tenantCompliance[ctx.viewer.tenantId] ?? []);
    const packs = mockDb.compliancePacks.filter((p) => codes.has(p.code));
    return list(ctx, packs, pageSchema(CompliancePackSchema));
  }),
];
