import {
  ChannelSchema,
  LocaleSchema,
  NotificationDeliverySchema,
  NotificationPreferenceSchema,
  NotificationTemplateSchema,
  TimeOfDaySchema,
  pageSchema,
  type Channel,
  type NotificationPreference,
  type NotificationTemplate,
} from "@nexus/contracts";
import { isValidMessage } from "@nexus/i18n/resolve";
import { z } from "zod";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";
import { appendAudit, json, newId, readBody, writeRoute } from "./write";

const M = "M07";
const TEMPLATE_MANAGE = "m07.template.manage";
const PREFERENCE_MANAGE = "m07.preference.manage";
const CHANNELS = ChannelSchema.options;

/**
 * Prototype-only (not a contract, NEX-024): the viewer's preferences plus which channels the institution has
 * set up. A channel counts as set up when the tenant has a template for it; push needs a provider in the build step.
 */
export const PreferencesResponseSchema = z.strictObject({
  preferences: z.array(NotificationPreferenceSchema),
  channels: z.array(z.strictObject({ channel: ChannelSchema, available: z.boolean() })),
});

const QuietHoursSchema = z
  .strictObject({ start: TimeOfDaySchema, end: TimeOfDaySchema })
  .nullable();

export const PreferencesInputSchema = z.strictObject({
  channels: z.array(z.strictObject({ channel: ChannelSchema, enabled: z.boolean() })),
  quietHours: QuietHoursSchema,
});

export const TemplateInputSchema = z.strictObject({
  subject: z.string().trim().min(1).max(300).nullable(),
  body: z.string().trim().min(1).max(10000),
  enabled: z.boolean(),
});

export const NewTemplateInputSchema = TemplateInputSchema.extend({
  eventType: z.string().min(1),
  channel: ChannelSchema,
  locale: LocaleSchema,
});

function assertIcu(subject: string | null, body: string): void {
  const bad = [
    ...(subject !== null && !isValidMessage(subject)
      ? [{ path: "subject", message: "Invalid ICU message" }]
      : []),
    ...(!isValidMessage(body) ? [{ path: "body", message: "Invalid ICU message" }] : []),
  ];
  if (bad.length > 0) throw new ApiFailure("invalid_request", bad);
}

function availableChannels(tenantId: string): Set<Channel> {
  return new Set(
    ofTenant(mockDb.notificationTemplates, tenantId)
      .map((t) => t.channel)
      .filter((c) => c !== "push"),
  );
}

export const m07Handlers = [
  get("/notification-templates", { module: M, permission: TEMPLATE_MANAGE }, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.notificationTemplates, ctx.viewer.tenantId),
      pageSchema(NotificationTemplateSchema),
    ),
  ),

  /** Filters: `status`, `channel` (exact). Newest first. */
  get("/notification-deliveries", { module: M, permission: TEMPLATE_MANAGE }, (ctx) => {
    const status = param(ctx.url, "status");
    const channel = param(ctx.url, "channel");
    const rows = ofTenant(mockDb.notificationDeliveries, ctx.viewer.tenantId)
      .filter(
        (d) =>
          (status === null || d.status === status) && (channel === null || d.channel === channel),
      )
      .sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
    return list(ctx, rows, pageSchema(NotificationDeliverySchema));
  }),

  /** The viewer's own preferences plus channel availability (preferences carry no tenant id). */
  get("/notification-preferences", { module: M, permission: PREFERENCE_MANAGE }, (ctx) => {
    const available = availableChannels(ctx.viewer.tenantId);
    return ok(PreferencesResponseSchema, {
      preferences: mockDb.notificationPreferences.filter((p) => p.userId === ctx.viewer.userId),
      channels: CHANNELS.map((channel) => ({ channel, available: available.has(channel) })),
    });
  }),

  /** Saves the viewer's own channel switches and quiet hours (one row per channel, all events). */
  writeRoute(
    "put",
    "/notification-preferences",
    { module: M, permission: PREFERENCE_MANAGE },
    async (ctx) => {
      const input = await readBody(ctx.request, PreferencesInputSchema);
      if (input.quietHours && input.quietHours.start === input.quietHours.end) {
        throw new ApiFailure("invalid_request", [
          { path: "quietHours", message: "Quiet hours need different start and end times" },
        ]);
      }
      const userId = ctx.viewer.userId;
      const rows = mockDb.notificationPreferences as NotificationPreference[];
      const timeZone =
        rows.find((p) => p.userId === userId)?.timeZone ??
        mockDb.institutions.find((i) => i.tenantId === ctx.viewer.tenantId)?.locale.timeZone ??
        "UTC";
      const next = input.channels.map((c) =>
        NotificationPreferenceSchema.parse({
          userId,
          channel: c.channel,
          eventType: null,
          enabled: c.enabled,
          quietHours: input.quietHours,
          timeZone,
        }),
      );
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i]!;
        if (row.userId !== userId) continue;
        if (row.eventType === null) rows.splice(i, 1);
        // Quiet hours belong to the person, so per-event rows follow them too.
        else rows[i] = NotificationPreferenceSchema.parse({ ...row, quietHours: input.quietHours });
      }
      rows.push(...next);
      await appendAudit(ctx.viewer, {
        module: M,
        action: "m07.preference.updated",
        targetType: "user",
        targetId: userId,
        fields: ["channels", "quietHours"],
      });
      const available = availableChannels(ctx.viewer.tenantId);
      return ok(PreferencesResponseSchema, {
        preferences: rows.filter((p) => p.userId === userId),
        channels: CHANNELS.map((channel) => ({ channel, available: available.has(channel) })),
      });
    },
  ),

  writeRoute(
    "put",
    "/notification-templates/:id",
    { module: M, permission: TEMPLATE_MANAGE },
    async (ctx) => {
      const rows = mockDb.notificationTemplates as NotificationTemplate[];
      const existing = found(
        ofTenant(rows, ctx.viewer.tenantId).find((t) => t.id === ctx.params["id"]),
      );
      const input = await readBody(ctx.request, TemplateInputSchema);
      assertIcu(input.subject, input.body);
      const updated = NotificationTemplateSchema.parse({
        ...existing,
        ...input,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      });
      rows[rows.indexOf(existing)] = updated;
      await appendAudit(ctx.viewer, {
        module: M,
        action: "m07.template.updated",
        targetType: "notificationTemplate",
        targetId: updated.id,
        fields: ["subject", "body", "enabled"],
      });
      return ok(NotificationTemplateSchema, updated);
    },
  ),

  /** A new locale version of an event + channel; duplicate event + channel + locale → 409. */
  writeRoute(
    "post",
    "/notification-templates",
    { module: M, permission: TEMPLATE_MANAGE },
    async (ctx) => {
      const input = await readBody(ctx.request, NewTemplateInputSchema);
      const rows = mockDb.notificationTemplates as NotificationTemplate[];
      const own = ofTenant(rows, ctx.viewer.tenantId);
      if (
        own.some(
          (t) =>
            t.eventType === input.eventType &&
            t.channel === input.channel &&
            t.locale === input.locale,
        )
      ) {
        throw new ApiFailure("conflict", [
          { path: "locale", message: "This locale already has a template" },
        ]);
      }
      assertIcu(input.subject, input.body);
      const created = NotificationTemplateSchema.parse({
        ...input,
        id: newId("ntp"),
        tenantId: ctx.viewer.tenantId,
        version: 1,
        updatedAt: new Date().toISOString(),
      });
      rows.push(created);
      await appendAudit(ctx.viewer, {
        module: M,
        action: "m07.template.created",
        targetType: "notificationTemplate",
        targetId: created.id,
        fields: ["eventType", "channel", "locale", "body"],
      });
      return json(created, 201);
    },
  ),
];
