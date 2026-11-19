import {
  NotificationDeliverySchema,
  NotificationPreferenceSchema,
  NotificationTemplateSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list } from "./route";

const M = "M07";
const TEMPLATE_MANAGE = "m07.template.manage";

export const m07Handlers = [
  get("/notification-templates", { module: M, permission: TEMPLATE_MANAGE }, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.notificationTemplates, ctx.viewer.tenantId),
      pageSchema(NotificationTemplateSchema),
    ),
  ),

  get("/notification-deliveries", { module: M, permission: TEMPLATE_MANAGE }, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.notificationDeliveries, ctx.viewer.tenantId),
      pageSchema(NotificationDeliverySchema),
    ),
  ),

  /** The viewer's own preferences (preferences carry no tenant id; the user id is tenant-scoped). */
  get("/notification-preferences", { module: M, permission: "m07.preference.manage" }, (ctx) =>
    list(
      ctx,
      mockDb.notificationPreferences.filter((p) => p.userId === ctx.viewer.userId),
      pageSchema(NotificationPreferenceSchema),
    ),
  ),
];
