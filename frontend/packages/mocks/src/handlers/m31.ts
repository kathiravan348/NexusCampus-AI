import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentItemSchema,
  pageSchema,
  type AccessibilityCheck,
  type AccessibilityIssue,
  type ContentItem,
} from "@nexus/contracts";
import { http } from "msw";
import { z } from "zod";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, ok, param } from "./route";

const M = { module: "M31", permission: "m31.content.read" } as const;
const MANAGE = "m31.content.manage";
const PUBLISH = "m31.content.publish";
const EmptyBodySchema = z.strictObject({});
const actionReceipts = new WeakMap<ContentItem, Map<string, ContentItem>>();

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

function checkMarkdownHeadings(
  markdown: string,
  previousLevel: number | null,
): { readonly skipped: boolean; readonly lastLevel: number | null } {
  let lastLevel = previousLevel;
  let skipped = false;
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^\s*(#{1,6})(?:\s|$)/.exec(line);
    if (!match) continue;
    const level = match[1]!.length;
    if (lastLevel === null ? level > 2 : level > lastLevel + 1) {
      skipped = true;
    }
    lastLevel = level;
  }
  return { skipped, lastLevel };
}

function computeAccessibility(item: ContentItem, checkedAt: string): AccessibilityCheck {
  const issues: AccessibilityIssue[] = [];
  if (item.kind === "video" && item.textTrackAssetIds.length === 0) {
    issues.push({ code: "missing_captions", blockIndex: null, severity: "error" });
  }
  if (item.kind === "audio" && item.textTrackAssetIds.length === 0) {
    issues.push({ code: "missing_transcript", blockIndex: null, severity: "error" });
  }
  if (item.blocks !== null) {
    let lastHeadingLevel: number | null = null;
    item.blocks.forEach((block, index) => {
      if (block.type === "video" && block.captionAssetIds.length === 0) {
        issues.push({ code: "missing_captions", blockIndex: index, severity: "error" });
      } else if (block.type === "image" && block.altText.trim().length === 0) {
        issues.push({ code: "missing_alt_text", blockIndex: index, severity: "error" });
      } else if (block.type === "text") {
        const result = checkMarkdownHeadings(block.markdown, lastHeadingLevel);
        lastHeadingLevel = result.lastLevel;
        if (result.skipped) {
          issues.push({ code: "heading_order", blockIndex: index, severity: "warning" });
        }
      }
    });
  }
  return { checkedAt, issues };
}

async function runWrite(
  request: Request,
  permission: typeof MANAGE | typeof PUBLISH,
  handle: (ctx: { viewer: Viewer; key: string | null }) => Response,
): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, "M31")) throw new ApiFailure("module_disabled");
    if (!viewer.permissions.has(permission)) throw new ApiFailure("forbidden");
    const rawText = await request.text();
    if (rawText.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new ApiFailure("invalid_request");
      }
      if (!EmptyBodySchema.safeParse(parsed).success) {
        throw new ApiFailure("invalid_request");
      }
    }
    return handle({ viewer, key: request.headers.get("Idempotency-Key") });
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
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
  http.post(`*${API_BASE}/content-items/:id/accessibility-check`, ({ request, params }) =>
    runWrite(request, MANAGE, ({ viewer, key }) => {
      const item = found(
        ofTenant(mockDb.contentItems, viewer.tenantId).find((row) => row.id === params["id"]),
      );
      const receipts = actionReceipts.get(item) ?? new Map<string, ContentItem>();
      const receiptKey =
        key && JSON.stringify([viewer.tenantId, item.id, viewer.userId, "check", key]);
      const saved = receiptKey ? receipts.get(receiptKey) : undefined;
      if (saved) return ok(ContentItemSchema, saved);

      const now = new Date().toISOString();
      const accessibility = computeAccessibility(item, now);
      if (
        item.status === "published" &&
        accessibility.issues.some((issue) => issue.severity === "error")
      ) {
        throw new ApiFailure("conflict", [
          { path: "accessibility", message: "Accessibility errors must be resolved" },
        ]);
      }
      const updated = ContentItemSchema.parse({ ...item, accessibility, updatedAt: now });
      mockDb.contentItems[mockDb.contentItems.indexOf(item)] = updated;
      if (receiptKey) receipts.set(receiptKey, updated);
      actionReceipts.set(updated, receipts);
      return ok(ContentItemSchema, updated);
    }),
  ),
  http.post(`*${API_BASE}/content-items/:id/publish`, ({ request, params }) =>
    runWrite(request, PUBLISH, ({ viewer, key }) => {
      const item = found(
        ofTenant(mockDb.contentItems, viewer.tenantId).find((row) => row.id === params["id"]),
      );
      const receipts = actionReceipts.get(item) ?? new Map<string, ContentItem>();
      const receiptKey =
        key && JSON.stringify([viewer.tenantId, item.id, viewer.userId, "publish", key]);
      const saved = receiptKey ? receipts.get(receiptKey) : undefined;
      if (saved) return ok(ContentItemSchema, saved);

      if (item.status === "published" || item.status === "archived") {
        throw new ApiFailure("conflict", [
          { path: "status", message: "Item is already published or archived" },
        ]);
      }

      const now = new Date().toISOString();
      const accessibility = computeAccessibility(item, now);
      if (accessibility.issues.some((issue) => issue.severity === "error")) {
        const checked = ContentItemSchema.parse({ ...item, accessibility, updatedAt: now });
        mockDb.contentItems[mockDb.contentItems.indexOf(item)] = checked;
        actionReceipts.set(checked, receipts);
        throw new ApiFailure("conflict", [
          { path: "accessibility", message: "Accessibility errors block publishing" },
        ]);
      }

      const published = ContentItemSchema.parse({
        ...item,
        status: "published",
        accessibility,
        updatedAt: now,
      });
      mockDb.contentItems[mockDb.contentItems.indexOf(item)] = published;
      if (receiptKey) receipts.set(receiptKey, published);
      actionReceipts.set(published, receipts);
      return ok(ContentItemSchema, published);
    }),
  ),
];
