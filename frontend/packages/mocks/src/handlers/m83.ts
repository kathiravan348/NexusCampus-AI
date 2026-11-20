import {
  AccessGrantSchema,
  AccessModeSchema,
  AccessRequestSchema,
  BreakGlassNoticeSchema,
  KeyStatusSchema,
  MAX_GRANT_HOURS,
  ModuleIdSchema,
  pageSchema,
  type AccessGrant,
  type AccessRequest,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";
import { appendAudit, newId, readBody, writeRoute } from "./write";

/** Vault and provider-access records are for the institution's own admins only (D22). */
const M = { module: "M83", permission: "m83.vault.read" } as const;

export const m83Handlers = [
  get("/vault/keys", M, (ctx) =>
    list(ctx, ofTenant(mockDb.keyStatuses, ctx.viewer.tenantId), pageSchema(KeyStatusSchema)),
  ),

  get("/access-requests", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.accessRequests, ctx.viewer.tenantId),
      pageSchema(AccessRequestSchema),
    ),
  ),

  get("/access-grants", M, (ctx) =>
    list(ctx, ofTenant(mockDb.accessGrants, ctx.viewer.tenantId), pageSchema(AccessGrantSchema)),
  ),

  get("/break-glass-notices", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.breakGlassNotices, ctx.viewer.tenantId),
      pageSchema(BreakGlassNoticeSchema),
    ),
  ),
];

const DECIDE = { module: "M83", permission: "m83.grant.approve" } as const;
const HOUR_MS = 3_600_000;

/** Approval may only narrow the request: a subset of modules, read instead of edit, a shorter duration. */
export const ApproveInputSchema = z.strictObject({
  modules: z.array(ModuleIdSchema).min(1),
  mode: AccessModeSchema,
  durationHours: z.int().min(1).max(MAX_GRANT_HOURS),
});

export const DenyInputSchema = z.strictObject({ reason: z.string().trim().min(1).max(2000) });

export const ApproveResponseSchema = z.strictObject({
  request: AccessRequestSchema,
  grant: AccessGrantSchema,
});

function pendingRequest(tenantId: string, id: string | undefined): AccessRequest {
  const request = found(ofTenant(mockDb.accessRequests, tenantId).find((r) => r.id === id));
  if (request.status !== "pending") {
    throw new ApiFailure("conflict", [{ path: "status", message: `Request is ${request.status}` }]);
  }
  return request;
}

function replaceRequest(updated: AccessRequest): void {
  const rows = mockDb.accessRequests as AccessRequest[];
  rows[rows.findIndex((r) => r.id === updated.id)] = updated;
}

export const m83WriteHandlers = [
  writeRoute("post", "/access-requests/:id/approve", DECIDE, async (ctx) => {
    const request = pendingRequest(ctx.viewer.tenantId, ctx.params["id"]);
    const input = await readBody(ctx.request, ApproveInputSchema);
    const widened = [
      ...input.modules
        .filter((m) => !request.modules.includes(m))
        .map((m) => ({ path: "modules", message: `${m} was not requested` })),
      ...(input.mode === "edit" && request.mode === "read"
        ? [{ path: "mode", message: "Edit was not requested" }]
        : []),
      ...(input.durationHours > request.durationHours
        ? [{ path: "durationHours", message: "Longer than requested" }]
        : []),
    ];
    if (widened.length > 0) throw new ApiFailure("invalid_request", widened);

    const now = new Date();
    const updated = AccessRequestSchema.parse({
      ...request,
      status: "approved",
      decidedAt: now.toISOString(),
      decidedBy: ctx.viewer.userId,
    });
    const grant = AccessGrantSchema.parse({
      id: newId("acg"),
      tenantId: ctx.viewer.tenantId,
      requestId: request.id,
      modules: [...new Set(input.modules)],
      mode: input.mode,
      startsAt: now.toISOString(),
      endsAt: new Date(now.getTime() + input.durationHours * HOUR_MS).toISOString(),
      revokedAt: null,
    });
    replaceRequest(updated);
    (mockDb.accessGrants as AccessGrant[]).push(grant);
    await appendAudit(ctx.viewer, {
      module: "M83",
      action: "m83.accessRequest.approved",
      targetType: "accessRequest",
      targetId: request.id,
      fields: ["status", "modules", "mode", "durationHours"],
    });
    return ok(ApproveResponseSchema, { request: updated, grant });
  }),

  writeRoute("post", "/access-requests/:id/deny", DECIDE, async (ctx) => {
    const request = pendingRequest(ctx.viewer.tenantId, ctx.params["id"]);
    await readBody(ctx.request, DenyInputSchema);
    const updated = AccessRequestSchema.parse({
      ...request,
      status: "denied",
      decidedAt: new Date().toISOString(),
      decidedBy: ctx.viewer.userId,
    });
    replaceRequest(updated);
    await appendAudit(ctx.viewer, {
      module: "M83",
      action: "m83.accessRequest.denied",
      targetType: "accessRequest",
      targetId: request.id,
      fields: ["status", "denialReason"],
    });
    return ok(AccessRequestSchema, updated);
  }),

  /** Ends an active grant now; the request becomes `revoked`. Ended or revoked grants → 409. */
  writeRoute("post", "/access-grants/:id/revoke", DECIDE, async (ctx) => {
    const rows = mockDb.accessGrants as AccessGrant[];
    const grant = found(ofTenant(rows, ctx.viewer.tenantId).find((g) => g.id === ctx.params["id"]));
    const now = new Date();
    if (grant.revokedAt !== null || Date.parse(grant.endsAt) <= now.getTime()) {
      throw new ApiFailure("conflict", [{ path: "status", message: "Grant is no longer active" }]);
    }
    const updated = AccessGrantSchema.parse({ ...grant, revokedAt: now.toISOString() });
    rows[rows.indexOf(grant)] = updated;
    const request = mockDb.accessRequests.find((r) => r.id === grant.requestId);
    if (request) replaceRequest(AccessRequestSchema.parse({ ...request, status: "revoked" }));
    await appendAudit(ctx.viewer, {
      module: "M83",
      action: "m83.accessGrant.revoked",
      targetType: "accessGrant",
      targetId: grant.id,
      fields: ["revokedAt"],
    });
    return ok(AccessGrantSchema, updated);
  }),
];
