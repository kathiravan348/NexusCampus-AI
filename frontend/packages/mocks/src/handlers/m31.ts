import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentItemSchema,
  ContentLessonInputSchema,
  type ContentLessonInput,
  pageSchema,
  type AccessibilityCheck,
  type AccessibilityIssue,
  type ContentItem,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { z } from "zod";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import type { Viewer } from "../context";
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

function checkMarkdownHeadings(markdown: string, previousLevel: number | null) {
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
    if (level > (lastLevel ?? 1) + 1) skipped = true;
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

type WriteContext = { viewer: Viewer; key: string | null; raw: unknown };

async function runWrite(
  request: Request,
  permission: typeof MANAGE | typeof PUBLISH,
  handle: (ctx: WriteContext) => Response,
): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, "M31")) throw new ApiFailure("module_disabled");
    if (!viewer.permissions.has(permission)) throw new ApiFailure("forbidden");
    const rawText = await request.text();
    const raw: unknown = JSON.parse(rawText.trim() || "{}");
    return handle({ viewer, raw, key: request.headers.get("Idempotency-Key") });
  } catch (error) {
    if (error instanceof SyntaxError) return failureResponse(new ApiFailure("invalid_request"));
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

function invalidFields(paths: string[]) {
  const error = new ApiFailure(
    "invalid_request",
    paths.map((path) => ({ path, message: "Invalid field" })),
  );
  const response = failureResponse(error);
  return new Response(response.body, { status: 422, headers: response.headers });
}

function referenceErrors(input: ContentLessonInput, tenantId: string) {
  const assets = new Map(ofTenant(mockDb.contentAssets, tenantId).map((a) => [a.id, a.kind]));
  const outcomes = new Set(ofTenant(mockDb.outcomes, tenantId).map((o) => o.id));
  const paths: string[] = [];
  input.outcomeIds.forEach((id, i) => {
    if (!outcomes.has(id)) paths.push(`outcomeIds.${i}`);
  });
  input.blocks.forEach((block, i) => {
    if ("assetId" in block && assets.get(block.assetId) !== block.type)
      paths.push(`blocks.${i}.assetId`);
    if (block.type === "video") {
      block.captionAssetIds.forEach((id, j) => {
        if (assets.get(id) !== "captions") paths.push(`blocks.${i}.captionAssetIds.${j}`);
      });
    }
  });
  return paths;
}

const createReceipts = new Map<string, ContentItem>();

function saveLesson({ viewer, raw, key }: WriteContext, id?: string | readonly string[]) {
  const { tenantId, userId } = viewer;
  const items = ofTenant(mockDb.contentItems, tenantId);
  const item = id === undefined ? undefined : found(items.find((row) => row.id === id));
  const receiptKey = key && JSON.stringify([tenantId, userId, id ?? null, "lesson", key]);
  if (receiptKey) {
    const saved = item ? actionReceipts.get(item)?.get(receiptKey) : createReceipts.get(receiptKey);
    if (saved && (item || items.some((row) => row.id === saved.id))) {
      return HttpResponse.json(saved, { status: item ? 200 : 201 });
    }
  }
  if (item && (item.kind !== "lesson" || item.status !== "draft")) throw new ApiFailure("conflict");
  const parsed = ContentLessonInputSchema.safeParse(raw);
  if (!parsed.success)
    return invalidFields(parsed.error.issues.map((i) => i.path.join(".") || "body"));
  const paths = referenceErrors(parsed.data, tenantId);
  if (paths.length) return invalidFields(paths);
  const updatedAt = new Date().toISOString();
  const changes = { ...parsed.data, accessibility: null, updatedAt };
  if (item) {
    const updated = ContentItemSchema.parse({ ...item, ...changes });
    storeChange(item, updated, receiptKey);
    return ok(ContentItemSchema, updated);
  }

  const today = updatedAt.slice(0, 10);
  const profile = ofTenant(mockDb.roleProfiles, tenantId).find(
    (row) =>
      row.personId === viewer.personId &&
      row.status === "active" &&
      row.effectiveFrom <= today &&
      (row.effectiveTo === null || row.effectiveTo >= today),
  );
  if (!profile) throw new ApiFailure("forbidden");
  const institution = found(mockDb.institutions.find((row) => row.tenantId === tenantId));
  const created = ContentItemSchema.parse({
    ...changes,
    id: `cit-${crypto.randomUUID()}`,
    tenantId,
    institutionId: institution.id,
    kind: "lesson",
    status: "draft",
    version: 1,
    aiAssisted: false,
    createdAt: updatedAt,
    createdByProfileId: profile.id,
    assetId: null,
    package: null,
    textTrackAssetIds: [],
    durationSeconds: null,
  });
  mockDb.contentItems.unshift(created);
  if (receiptKey) createReceipts.set(receiptKey, created);
  return HttpResponse.json(created, { status: 201 });
}

function storeChange(item: ContentItem, updated: ContentItem, key: string | null) {
  const receipts = actionReceipts.get(item) ?? new Map<string, ContentItem>();
  if (key) receipts.set(key, updated);
  mockDb.contentItems[mockDb.contentItems.indexOf(item)] = updated;
  actionReceipts.set(updated, receipts);
}

function checkOrPublish(action: "accessibility-check" | "publish") {
  const publish = action === "publish";
  return http.post(`*${API_BASE}/content-items/:id/${action}`, ({ request, params }) =>
    runWrite(request, publish ? PUBLISH : MANAGE, ({ viewer, key, raw }) => {
      if (!EmptyBodySchema.safeParse(raw).success) throw new ApiFailure("invalid_request");
      const item = found(
        ofTenant(mockDb.contentItems, viewer.tenantId).find((row) => row.id === params["id"]),
      );
      const receiptKey =
        key && JSON.stringify([viewer.tenantId, item.id, viewer.userId, action, key]);
      const saved = receiptKey && actionReceipts.get(item)?.get(receiptKey);
      if (saved) return ok(ContentItemSchema, saved);
      if (publish && (item.status === "published" || item.status === "archived")) {
        throw new ApiFailure("conflict", [
          { path: "status", message: "Item is already published or archived" },
        ]);
      }
      const updatedAt = new Date().toISOString();
      const accessibility = computeAccessibility(item, updatedAt);
      if (
        (publish || item.status === "published") &&
        accessibility.issues.some((i) => i.severity === "error")
      ) {
        if (publish)
          storeChange(item, ContentItemSchema.parse({ ...item, updatedAt, accessibility }), null);
        throw new ApiFailure("conflict", [
          { path: "accessibility", message: "Accessibility errors must be resolved" },
        ]);
      }
      const status = publish ? "published" : item.status;
      const updated = ContentItemSchema.parse({ ...item, updatedAt, accessibility, status });
      storeChange(item, updated, receiptKey);
      return ok(ContentItemSchema, updated);
    }),
  );
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
  http.post(`*${API_BASE}/content-items`, ({ request }) =>
    runWrite(request, MANAGE, (ctx) => saveLesson(ctx)),
  ),
  http.put(`*${API_BASE}/content-items/:id`, ({ request, params }) =>
    runWrite(request, MANAGE, (ctx) => saveLesson(ctx, params["id"])),
  ),
  checkOrPublish("accessibility-check"),
  checkOrPublish("publish"),
];
