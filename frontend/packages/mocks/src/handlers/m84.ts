import {
  BackupJobSchema,
  DiagnosticBundleSchema,
  InstallStatusSchema,
  UpdateOfferSchema,
  pageSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure } from "../context";
import { mockDb } from "../db";
import { get, list, ok, type RouteContext } from "./route";

/**
 * Install agent (M84): answered by the install itself in production. Institution admins only (install
 * administration is institution administration); a tenant without an install gets `module_disabled`.
 */
const M = { module: "M84", permission: "m01.institution.manage" } as const;

export const UpdateOfferResponseSchema = z.strictObject({ offer: UpdateOfferSchema.nullable() });

function installOf(ctx: RouteContext) {
  const install = mockDb.installs[ctx.viewer.tenantId];
  if (!install) throw new ApiFailure("module_disabled");
  return install;
}

export const m84Handlers = [
  get("/install/status", M, (ctx) => ok(InstallStatusSchema, installOf(ctx).status)),
  get("/install/update", M, (ctx) =>
    ok(UpdateOfferResponseSchema, { offer: installOf(ctx).update }),
  ),
  get("/install/backups", M, (ctx) =>
    list(ctx, installOf(ctx).backups, pageSchema(BackupJobSchema)),
  ),
  get("/install/diagnostics", M, (ctx) =>
    list(ctx, installOf(ctx).diagnostics, pageSchema(DiagnosticBundleSchema)),
  ),
];
