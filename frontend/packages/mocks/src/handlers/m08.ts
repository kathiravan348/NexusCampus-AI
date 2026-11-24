import {
  ConfigEntitySchema,
  CustomFieldDefinitionSchema,
  FormDefinitionSchema,
  NumberingFormatSchema,
  WorkflowDefinitionSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list, param } from "./route";

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
