import {
  AuditEventSchema,
  CompliancePackSchema,
  ConsentSchema,
  DataSubjectRequestSchema,
  DsrStatusSchema,
  UtcDateTimeSchema,
  pageSchema,
  type AuditEvent,
  type DataSubjectRequest,
  type DsrStatus,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { z } from "zod";
import {
  ApiFailure,
  entitled,
  failureResponse,
  familyOf,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { auditHashInput } from "../fixtures/audit";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, param } from "./route";

const M = "M06";
const AUDIT_READ = "m06.audit.read";
/** Data subject requests are restricted data (G-6): the catalogue's sensitive `m06.request.manage`. */
const DSR_MANAGE = "m06.request.manage";

export const DsrUpdateInputSchema = z.strictObject({
  status: DsrStatusSchema,
  reason: z.string().max(500).optional(),
});

const NEXT: Readonly<Record<DsrStatus, readonly DsrStatus[]>> = {
  received: ["in_progress"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

const STATUS_ACTION: Readonly<Record<DsrStatus, string>> = {
  received: "received",
  in_progress: "started",
  completed: "completed",
  rejected: "rejected",
};

/** Appends one M06 event to the tenant's hash chain (values never stored, only field names). */
async function appendAudit(
  viewer: Viewer,
  action: string,
  targetId: string,
  fields: readonly string[],
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
    moduleId: M,
    targetType: "dataSubjectRequest",
    targetId,
    deviceId: null,
    changes: fields.map((field) => ({ field, sensitive: false })),
    prevHash,
    hash,
  });
  mockDb.auditEvents.push(event);
}

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

  /**
   * Move a request one step: received → in_progress → completed | rejected (else 409). A rejection needs a
   * `reason`; only the field name is audited (E-3), never the text.
   */
  http.patch(`*${API_BASE}/data-requests/:id`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, M)) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has(DSR_MANAGE)) throw new ApiFailure("forbidden");
      const dsr = found(
        ofTenant(mockDb.dataRequests, viewer.tenantId).find((r) => r.id === params["id"]),
      );
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
      }
      const parsed = DsrUpdateInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const { status, reason } = parsed.data;
      if (!NEXT[dsr.status].includes(status)) {
        throw new ApiFailure("conflict", [
          { path: "status", message: `Cannot move a ${dsr.status} request to ${status}` },
        ]);
      }
      if (status === "rejected" && !reason?.trim()) {
        throw new ApiFailure("invalid_request", [
          { path: "reason", message: "A rejection needs a reason" },
        ]);
      }
      const now = new Date().toISOString();
      const updated = DataSubjectRequestSchema.parse({
        ...dsr,
        status,
        handledBy: viewer.userId,
        completedAt: status === "completed" || status === "rejected" ? now : null,
      });
      const rows = mockDb.dataRequests as DataSubjectRequest[];
      rows[rows.indexOf(dsr)] = updated;
      await appendAudit(viewer, `m06.dataRequest.${STATUS_ACTION[status]}`, updated.id, [
        "status",
        ...(status === "rejected" ? ["rejectionReason"] : []),
      ]);
      return HttpResponse.json(updated as JsonBodyType);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),

  /** The compliance packs that apply to this tenant. */
  get("/compliance-packs", { module: M, permission: AUDIT_READ }, (ctx) => {
    const codes = new Set(mockDb.tenantCompliance[ctx.viewer.tenantId] ?? []);
    const packs = mockDb.compliancePacks.filter((p) => codes.has(p.code));
    return list(ctx, packs, pageSchema(CompliancePackSchema));
  }),
];
