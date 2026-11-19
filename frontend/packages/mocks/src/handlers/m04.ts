import {
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  pageSchema,
  type TextOverride,
  type TextOverrideRevision,
} from "@nexus/contracts";
import { isValidMessage } from "@nexus/i18n/resolve";
import { http } from "msw";
import type { z } from "zod";
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
import {
  M04_MANAGE,
  M04_MODULE,
  TextOverrideDeleteResponseSchema,
  TextOverrideImportInputSchema,
  TextOverrideImportResultSchema,
  TextOverrideRollbackInputSchema,
  TextOverrideRollbackResponseSchema,
  TextOverrideSaveInputSchema,
  appendM04Audit,
  archiveKey,
  archiveMap,
  evaluateImportEntries,
  findInstitutionOverride,
  hasGroupLock,
  maxRevisionVersion,
  requireLocaleAndKey,
  tenantInstitutionId,
  upsertInstitutionOverride,
} from "./m04Store";
import { API_BASE, found, get, list, ok, param } from "./route";

export {
  ImportDiffEntrySchema,
  ImportRejectedEntrySchema,
  ImportRejectionReasonSchema,
  TextOverrideDeleteResponseSchema,
  TextOverrideImportInputSchema,
  TextOverrideImportResultSchema,
  TextOverrideRollbackInputSchema,
  TextOverrideRollbackResponseSchema,
  TextOverrideSaveInputSchema,
} from "./m04Store";

async function runWrite(
  request: Request,
  handle: (viewer: Viewer, url: URL) => Promise<Response>,
): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, M04_MODULE)) throw new ApiFailure("module_disabled");
    if (!viewer.permissions.has(M04_MANAGE)) throw new ApiFailure("forbidden");
    return await handle(viewer, new URL(request.url));
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

async function readJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

export const m04Handlers = [
  /** Every user needs the overrides to render texts; `?locale=` keeps one locale. */
  get("/texts/overrides", { module: M04_MODULE }, (ctx) => {
    const locale = param(ctx.url, "locale");
    const overrides = ofTenant(mockDb.textOverrides, ctx.viewer.tenantId).filter(
      (o) => locale === null || o.locale === locale,
    );
    return list(ctx, overrides, pageSchema(TextOverrideSchema));
  }),

  /** History of this tenant's overrides; `?key=` and `?locale=` narrow to studio (group/institution) revisions. */
  get("/texts/revisions", { module: M04_MODULE, permission: M04_MANAGE }, (ctx) => {
    const key = param(ctx.url, "key");
    const locale = param(ctx.url, "locale");
    const ids = new Set<string>();
    for (const o of ofTenant(mockDb.textOverrides, ctx.viewer.tenantId)) {
      if (key !== null && o.scope.kind === "campus") continue;
      if ((key === null || o.key === key) && (locale === null || o.locale === locale)) {
        ids.add(o.id);
      }
    }
    for (const meta of archiveMap().values()) {
      if (
        meta.tenantId === ctx.viewer.tenantId &&
        (key === null || meta.key === key) &&
        (locale === null || meta.locale === locale)
      ) {
        ids.add(meta.id);
      }
    }
    const revisions = mockDb.textOverrideRevisions.filter((r) => ids.has(r.overrideId));
    return list(ctx, revisions, pageSchema(TextOverrideRevisionSchema));
  }),

  http.put(`*${API_BASE}/texts/overrides/:key`, ({ request, params }) =>
    runWrite(request, async (viewer, url) => {
      const { locale, key } = requireLocaleAndKey(url, params["key"]);
      const { message } = await readJsonBody(request, TextOverrideSaveInputSchema);
      if (!isValidMessage(message)) {
        throw new ApiFailure("invalid_request", [
          { path: "message", message: "Invalid ICU message syntax" },
        ]);
      }
      if (hasGroupLock(viewer.tenantId, locale, key)) {
        throw new ApiFailure("conflict", [
          { path: "key", message: `Key ${key} is locked by a group override` },
        ]);
      }
      const { override } = upsertInstitutionOverride(viewer, locale, key, message);
      await appendM04Audit(viewer, "m04.text.updated", override.id);
      return ok(TextOverrideSchema, override);
    }),
  ),

  http.delete(`*${API_BASE}/texts/overrides/:key`, ({ request, params }) =>
    runWrite(request, async (viewer, url) => {
      const { locale, key } = requireLocaleAndKey(url, params["key"]);
      const existing = findInstitutionOverride(viewer.tenantId, locale, key);
      if (!existing && hasGroupLock(viewer.tenantId, locale, key)) {
        throw new ApiFailure("conflict", [
          { path: "key", message: `Key ${key} is locked by a group override` },
        ]);
      }
      const target = found(existing);
      mockDb.textOverrides.splice(
        mockDb.textOverrides.findIndex((o) => o.id === target.id),
        1,
      );
      archiveMap().set(archiveKey(viewer.tenantId, locale, key), {
        id: target.id,
        tenantId: viewer.tenantId,
        locale,
        key,
      });
      const version = Math.max(target.version, maxRevisionVersion(target.id)) + 1;
      mockDb.textOverrideRevisions.push(
        TextOverrideRevisionSchema.parse({
          overrideId: target.id,
          version,
          message: null,
          changedBy: viewer.userId,
          changedAt: new Date().toISOString(),
        }),
      );
      await appendM04Audit(viewer, "m04.text.deleted", target.id);
      return ok(TextOverrideDeleteResponseSchema, { deleted: true, key, locale, version });
    }),
  ),

  http.post(`*${API_BASE}/texts/overrides/import`, ({ request }) =>
    runWrite(request, async (viewer) => {
      const { locale, entries, dryRun } = await readJsonBody(
        request,
        TextOverrideImportInputSchema,
      );
      const diff = evaluateImportEntries(viewer.tenantId, locale, entries);

      if (!dryRun && diff.rejected.length > 0) {
        throw new ApiFailure(
          "invalid_request",
          diff.rejected.map((r) => ({ path: `entries.${r.key}`, message: r.message })),
        );
      }

      let appliedCount = 0;
      if (!dryRun) {
        for (const item of [...diff.added, ...diff.changed]) {
          upsertInstitutionOverride(viewer, locale, item.key, item.after);
          appliedCount += 1;
        }
        if (appliedCount > 0) {
          await appendM04Audit(viewer, "m04.text.imported", tenantInstitutionId(viewer.tenantId));
        }
      }

      return ok(TextOverrideImportResultSchema, { dryRun, locale, ...diff, appliedCount });
    }),
  ),

  http.post(`*${API_BASE}/texts/overrides/:key/rollback`, ({ request, params }) =>
    runWrite(request, async (viewer, url) => {
      const { locale, key } = requireLocaleAndKey(url, params["key"]);
      const { version } = await readJsonBody(request, TextOverrideRollbackInputSchema);
      if (hasGroupLock(viewer.tenantId, locale, key)) {
        throw new ApiFailure("conflict", [
          { path: "key", message: `Key ${key} is locked by a group override` },
        ]);
      }
      const active = findInstitutionOverride(viewer.tenantId, locale, key);
      const archived = archiveMap().get(archiveKey(viewer.tenantId, locale, key));
      const overrideId = active?.id ?? archived?.id;
      const targetRev = found(
        overrideId
          ? mockDb.textOverrideRevisions.find(
              (r) => r.overrideId === overrideId && r.version === version,
            )
          : undefined,
      );

      let override: TextOverride | null = null;
      let revision: TextOverrideRevision;
      if (targetRev.message !== null) {
        const res = upsertInstitutionOverride(viewer, locale, key, targetRev.message);
        override = res.override;
        revision = res.revision;
      } else {
        if (active) {
          mockDb.textOverrides.splice(
            mockDb.textOverrides.findIndex((o) => o.id === active.id),
            1,
          );
          archiveMap().set(archiveKey(viewer.tenantId, locale, key), {
            id: active.id,
            tenantId: viewer.tenantId,
            locale,
            key,
          });
        }
        revision = TextOverrideRevisionSchema.parse({
          overrideId: targetRev.overrideId,
          version: maxRevisionVersion(targetRev.overrideId) + 1,
          message: null,
          changedBy: viewer.userId,
          changedAt: new Date().toISOString(),
        });
        mockDb.textOverrideRevisions.push(revision);
      }

      await appendM04Audit(viewer, "m04.text.rolledBack", targetRev.overrideId);
      return ok(TextOverrideRollbackResponseSchema, { override, revision });
    }),
  ),
];
