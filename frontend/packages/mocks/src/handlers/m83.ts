import {
  AccessGrantSchema,
  AccessRequestSchema,
  BreakGlassNoticeSchema,
  KeyStatusSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list } from "./route";

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
