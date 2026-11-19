import { AiCreditSchema, AiSettingsSchema, pageSchema } from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";

const M = "M11";
const SETTINGS_MANAGE = "m11.settings.manage";

export const m11Handlers = [
  /** Assist users read it too: the panel shows the AI-off state from `enabled` (NEX-020). */
  get("/ai/settings", { module: M, permission: ["m11.assist.use", SETTINGS_MANAGE] }, (ctx) =>
    ok(AiSettingsSchema, found(mockDb.aiSettings.find((s) => s.tenantId === ctx.viewer.tenantId))),
  ),

  get("/ai/credits", { module: M, permission: SETTINGS_MANAGE }, (ctx) =>
    list(ctx, ofTenant(mockDb.aiCredits, ctx.viewer.tenantId), pageSchema(AiCreditSchema)),
  ),
];
