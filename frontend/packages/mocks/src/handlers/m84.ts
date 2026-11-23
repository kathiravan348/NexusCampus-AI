import {
  BackupJobSchema,
  DiagnosticBundleSchema,
  DiagnosticContentSchema,
  InstallStatusSchema,
  UpdateOfferSchema,
  pageSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure } from "../context";
import { mockDb } from "../db";
import { get, list, ok, type RouteContext } from "./route";
import { json, writeRoute } from "./write";

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

function bundleOf(ctx: RouteContext) {
  const bundle = installOf(ctx).diagnostics.find((b) => b.id === ctx.params["id"]);
  if (!bundle) throw new ApiFailure("not_found");
  return bundle;
}

/** As the backend `_decide`: only a bundle waiting for review, reviewer = the signed-in admin (NEX-112, NEX-144). */
function decide(status: "approved" | "discarded") {
  return (ctx: RouteContext) => {
    const install = installOf(ctx);
    const bundle = bundleOf(ctx);
    if (bundle.status !== "ready_for_review") throw new ApiFailure("conflict");
    const updated = DiagnosticBundleSchema.parse({
      ...bundle,
      status,
      reviewedBy: ctx.viewer.userId,
    });
    mockDb.installs[ctx.viewer.tenantId] = {
      ...install,
      diagnostics: install.diagnostics.map((b) => (b.id === updated.id ? updated : b)),
    };
    return Promise.resolve(json(updated));
  };
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
  get("/install/diagnostics/:id/content", M, (ctx) => {
    const bundle = bundleOf(ctx);
    const content = installOf(ctx).diagnosticContent[bundle.id];
    if (content === undefined) throw new ApiFailure("not_found");
    return ok(DiagnosticContentSchema, { id: bundle.id, content });
  }),
  writeRoute("post", "/install/diagnostics/:id/approve", M, decide("approved")),
  writeRoute("post", "/install/diagnostics/:id/discard", M, decide("discarded")),
];
