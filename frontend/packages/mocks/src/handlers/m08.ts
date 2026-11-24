import {
  ConfigEntitySchema,
  CustomFieldDefinitionSchema,
  CustomFieldInputSchema,
  FormDefinitionSchema,
  NumberingFormatSchema,
  WorkflowDefinitionSchema,
  pageSchema,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, get, list, param } from "./route";

const M = { module: "M08", permission: "m08.config.read" } as const;

export const m08Handlers = [
  get("/custom-fields", M, (ctx) => {
    const entity = param(ctx.url, "entity");
    if (entity !== null && !ConfigEntitySchema.safeParse(entity).success) {
      throw new ApiFailure("invalid_request");
    }
    const fields = ofTenant(mockDb.customFieldDefinitions, ctx.viewer.tenantId);
    return list(
      ctx,
      fields.filter((field) => entity === null || field.entity === entity),
      pageSchema(CustomFieldDefinitionSchema),
    );
  }),
  http.post(`*${API_BASE}/custom-fields`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      const { tenantId } = viewer;
      if (!entitled(tenantId, "M08")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m08.config.manage")) throw new ApiFailure("forbidden");

      const raw: unknown = await request.json().catch(() => null);
      const parsed = CustomFieldInputSchema.safeParse(raw);
      if (!parsed.success) {
        // Schema issues can include user-supplied keys. Return only known top-level paths.
        const paths = new Set(parsed.error.issues.map(({ path }) => path[0]));
        const details = Object.keys(CustomFieldInputSchema.shape)
          .filter((key) => paths.has(key))
          .map((key) => ({ path: key, message: "Invalid field definition" }));
        throw new ApiFailure("invalid_request", details);
      }
      const input = parsed.data;
      const locale = ofTenant(mockDb.institutions, tenantId)[0]?.locale.defaultLocale;
      if (!locale || !input.label[locale]) {
        throw new ApiFailure("invalid_request", [
          { path: "label", message: "A label in the default locale is required" },
        ]);
      }
      const exists = ofTenant(mockDb.customFieldDefinitions, tenantId).some(
        (field) => field.entity === input.entity && field.key === input.key,
      );
      if (exists) throw new ApiFailure("conflict");

      const now = new Date().toISOString();
      const created = CustomFieldDefinitionSchema.parse({
        ...input,
        id: `cf-${globalThis.crypto.randomUUID()}`,
        tenantId,
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.customFieldDefinitions.push(created);
      return HttpResponse.json(created, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
  get("/forms", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.formDefinitions, ctx.viewer.tenantId),
      pageSchema(FormDefinitionSchema),
    ),
  ),
  get("/workflows", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.workflowDefinitions, ctx.viewer.tenantId),
      pageSchema(WorkflowDefinitionSchema),
    ),
  ),
  get("/numbering-formats", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.numberingFormats, ctx.viewer.tenantId),
      pageSchema(NumberingFormatSchema),
    ),
  ),
];
