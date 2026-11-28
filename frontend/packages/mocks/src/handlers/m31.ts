import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentItemSchema,
  pageSchema,
  type ContentItem,
} from "@nexus/contracts";
import { ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const M = { module: "M31", permission: "m31.content.read" } as const;
const MANAGE = "m31.content.manage";

function contentItems(viewer: Viewer) {
  const manage = viewer.permissions.has(MANAGE);
  return ofTenant(mockDb.contentItems, viewer.tenantId).filter(
    (item) => manage || item.status === "published",
  );
}

function assetIdsOf(item: ContentItem): string[] {
  const ids = [...item.textTrackAssetIds];
  if (item.assetId !== null) ids.push(item.assetId);
  if (item.package) ids.push(item.package.assetId);
  for (const block of item.blocks ?? []) {
    if (block.type === "image" || block.type === "video") ids.push(block.assetId);
    if (block.type === "video") ids.push(...block.captionAssetIds);
  }
  return ids;
}

export const m31Handlers = [
  get("/content-items", M, (ctx) =>
    list(ctx, contentItems(ctx.viewer), pageSchema(ContentItemSchema)),
  ),
  get("/content-items/:id", M, (ctx) =>
    ok(
      ContentItemSchema,
      found(contentItems(ctx.viewer).find((row) => row.id === ctx.params["id"])),
    ),
  ),
  get("/content-assets", M, (ctx) => {
    const assets = ofTenant(mockDb.contentAssets, ctx.viewer.tenantId);
    if (ctx.viewer.permissions.has(MANAGE))
      return list(ctx, assets, pageSchema(ContentAssetSchema));
    const visibleIds = new Set(contentItems(ctx.viewer).flatMap(assetIdsOf));
    return list(
      ctx,
      assets.filter((row) => visibleIds.has(row.id)),
      pageSchema(ContentAssetSchema),
    );
  }),
  get("/content-attempts", M, (ctx) => {
    const { tenantId, personId, permissions } = ctx.viewer;
    const contentItemId = param(ctx.url, "contentItemId");
    const items = contentItems(ctx.viewer);
    const visibleIds = new Set(items.map((row) => row.id));
    if (contentItemId !== null) found(items.find((row) => row.id === contentItemId));

    const manage = permissions.has(MANAGE);
    const learnerIds = new Set(
      ofTenant(mockDb.learners, tenantId)
        .filter((row) => row.personId === personId)
        .map((row) => row.id),
    );
    const rows = ofTenant(mockDb.contentAttempts, tenantId).filter(
      (row) =>
        visibleIds.has(row.contentItemId) &&
        (contentItemId === null || row.contentItemId === contentItemId) &&
        (manage || learnerIds.has(row.learnerId)),
    );
    return list(ctx, rows, pageSchema(ContentAttemptSchema));
  }),
];
