import { TextOverrideRevisionSchema, TextOverrideSchema, pageSchema } from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list } from "./route";

const M = "M04";

export const m04Handlers = [
  /** Every user needs the overrides to render texts; `?locale=` keeps one locale. */
  get("/texts/overrides", { module: M }, (ctx) => {
    const locale = ctx.url.searchParams.get("locale");
    const overrides = ofTenant(mockDb.textOverrides, ctx.viewer.tenantId).filter(
      (o) => locale === null || o.locale === locale,
    );
    return list(ctx, overrides, pageSchema(TextOverrideSchema));
  }),

  /** History of this tenant's overrides; `?key=` keeps one message key. */
  get("/texts/revisions", { module: M, permission: "m04.text.manage" }, (ctx) => {
    const key = ctx.url.searchParams.get("key");
    const ids = new Set(
      ofTenant(mockDb.textOverrides, ctx.viewer.tenantId)
        .filter((o) => key === null || o.key === key)
        .map((o) => o.id),
    );
    const revisions = mockDb.textOverrideRevisions.filter((r) => ids.has(r.overrideId));
    return list(ctx, revisions, pageSchema(TextOverrideRevisionSchema));
  }),
];
