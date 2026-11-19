import { z } from "zod";
import { IdSchema, LocaleSchema, TimeZoneSchema, UtcDateTimeSchema } from "./common";

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);

/** `<module>.<entity>.<action>`, same shape as `DomainEvent.eventType` (e.g. `m07.fee.due`). */
const EventTypeSchema = z.string().regex(/^[mp]\d{2}(\.[a-z][a-zA-Z0-9]*){2,}$/, {
  message: "Must be <module>.<entity>.<action>, e.g. m02.user.invited",
});

/** Delivery channels (G-7). Which ones work depends on the tenant's configured providers (DM-7). */
export const ChannelSchema = z.enum(["email", "sms", "whatsapp", "push", "in_app"]);
export type Channel = z.infer<typeof ChannelSchema>;

/** Message text for one event, channel and locale (M07). `body` is ICU; checked by editor and server. */
export const NotificationTemplateSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    eventType: EventTypeSchema,
    channel: ChannelSchema,
    locale: LocaleSchema,
    /** Email subject line; required for `email`, null for every other channel. */
    subject: z.string().trim().min(1).max(300).nullable(),
    body: z.string().trim().min(1).max(10000),
    version: z.int().min(1),
    enabled: z.boolean(),
    updatedAt: UtcDateTimeSchema,
  })
  .refine((t) => (t.subject !== null) === (t.channel === "email"), {
    message: "subject is required for email and must be null for other channels",
    path: ["subject"],
  });
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;

export const DeliveryStatusSchema = z.enum(["queued", "sent", "delivered", "failed", "suppressed"]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

/** One message sent (or not) to one person. `reason` explains `failed` / `suppressed` (e.g. quiet hours). */
export const NotificationDeliverySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    templateId: IdSchema,
    recipientPersonId: IdSchema,
    channel: ChannelSchema,
    status: DeliveryStatusSchema,
    reason: z.string().trim().min(1).max(500).nullable(),
    queuedAt: UtcDateTimeSchema,
    sentAt: UtcDateTimeSchema.nullable(),
  })
  .refine((d) => (d.reason !== null) === (d.status === "failed" || d.status === "suppressed"), {
    message: "reason is required for failed or suppressed deliveries and must be null otherwise",
    path: ["reason"],
  })
  .refine((d) => d.sentAt === null || notBefore(d.queuedAt, d.sentAt), {
    message: "sentAt is before queuedAt",
    path: ["sentAt"],
  })
  .refine((d) => d.sentAt !== null || (d.status !== "sent" && d.status !== "delivered"), {
    message: "sent and delivered messages need sentAt",
    path: ["sentAt"],
  })
  .refine((d) => d.sentAt === null || (d.status !== "queued" && d.status !== "suppressed"), {
    message: "queued and suppressed messages were never sent, so sentAt must be null",
    path: ["sentAt"],
  });
export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;

/** Local time of day `HH:mm`, 24-hour. */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: "Must be HH:mm, e.g. 21:30",
});
export type TimeOfDay = z.infer<typeof TimeOfDaySchema>;

/**
 * A user's choice for one channel, for one event type or all (`eventType: null`). Quiet hours may cross
 * midnight (`22:00`–`07:00`) and are read in `timeZone`.
 */
export const NotificationPreferenceSchema = z
  .strictObject({
    userId: IdSchema,
    channel: ChannelSchema,
    eventType: EventTypeSchema.nullable(),
    enabled: z.boolean(),
    quietHours: z.strictObject({ start: TimeOfDaySchema, end: TimeOfDaySchema }).nullable(),
    timeZone: TimeZoneSchema,
  })
  .refine((p) => p.quietHours === null || p.quietHours.start !== p.quietHours.end, {
    message: "quiet hours need different start and end times",
    path: ["quietHours"],
  });
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;
