import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";
import { ChannelSchema, TimeOfDaySchema } from "./notification";

const hasNoDuplicates = (values: readonly string[]) => new Set(values).size === values.length;

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

export const MessageThreadKindSchema = z.enum([
  "direct",
  "class_group",
  "staff_group",
  "broadcast",
]);
export type MessageThreadKind = z.infer<typeof MessageThreadKindSchema>;

/** Communication thread (M24). Direct and group threads need ≥ 2 participants; broadcasts may have 1. */
export const MessageThreadSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    kind: MessageThreadKindSchema,
    subject: z.string().trim().min(1).max(160),
    participantPersonIds: z.array(IdSchema).min(1).max(500),
    classGroupId: IdSchema.nullable(),
    lastMessageAt: UtcDateTimeSchema.nullable(),
    archived: z.boolean(),
    ...timestamps,
  })
  .refine((thread) => hasNoDuplicates(thread.participantPersonIds), {
    message: "participantPersonIds has duplicates",
    path: ["participantPersonIds"],
  })
  .refine((thread) => thread.kind === "broadcast" || thread.participantPersonIds.length >= 2, {
    message: "participantPersonIds requires at least 2 participants unless kind is broadcast",
    path: ["participantPersonIds"],
  })
  .refine((thread) => (thread.classGroupId !== null) === (thread.kind === "class_group"), {
    message: "classGroupId must be set iff kind is class_group",
    path: ["classGroupId"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type MessageThread = z.infer<typeof MessageThreadSchema>;

/**
 * One message inside a thread (M24). `body` is personal data (G-6, V-7) and must never be logged.
 * `deviceId` records the originating device for offline L2 capture.
 */
export const ThreadMessageSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    threadId: IdSchema,
    senderPersonId: IdSchema,
    /** Personal data (G-6, V-7); never log or emit in telemetry. */
    body: z.string().trim().min(1).max(4000),
    attachmentIds: z.array(IdSchema).max(10),
    sentAt: UtcDateTimeSchema,
    editedAt: UtcDateTimeSchema.nullable(),
    readByPersonIds: z.array(IdSchema).max(500),
    /** Originating device id for offline L2 capture; null when sent online without a device id. */
    deviceId: IdSchema.nullable(),
  })
  .refine((msg) => hasNoDuplicates(msg.attachmentIds), {
    message: "attachmentIds has duplicates",
    path: ["attachmentIds"],
  })
  .refine((msg) => hasNoDuplicates(msg.readByPersonIds), {
    message: "readByPersonIds has duplicates",
    path: ["readByPersonIds"],
  })
  .refine((msg) => msg.editedAt === null || Date.parse(msg.editedAt) >= Date.parse(msg.sentAt), {
    message: "editedAt is before sentAt",
    path: ["editedAt"],
  });
export type ThreadMessage = z.infer<typeof ThreadMessageSchema>;

export const NoticeAudienceKindSchema = z.enum(["everyone", "class_groups", "roles", "people"]);
export type NoticeAudienceKind = z.infer<typeof NoticeAudienceKindSchema>;

export const NoticeAudienceSchema = z
  .strictObject({
    kind: NoticeAudienceKindSchema,
    ids: z.array(IdSchema).max(500),
  })
  .refine((audience) => hasNoDuplicates(audience.ids), {
    message: "ids has duplicates",
    path: ["ids"],
  })
  .refine((audience) => (audience.ids.length === 0) === (audience.kind === "everyone"), {
    message: "ids must be empty iff audience kind is everyone",
    path: ["ids"],
  });
export type NoticeAudience = z.infer<typeof NoticeAudienceSchema>;

export const NoticeStatusSchema = z.enum(["draft", "scheduled", "published", "withdrawn"]);
export type NoticeStatus = z.infer<typeof NoticeStatusSchema>;

/** Institution notice (M24) delivered across one or more notification channels. */
export const NoticeSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(8000),
    audience: NoticeAudienceSchema,
    channels: z.array(ChannelSchema).min(1).max(5),
    requiresAcknowledgement: z.boolean(),
    publishAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema.nullable(),
    status: NoticeStatusSchema,
    createdByStaffProfileId: IdSchema,
    ...timestamps,
  })
  .refine((notice) => hasNoDuplicates(notice.channels), {
    message: "channels has duplicates",
    path: ["channels"],
  })
  .refine((n) => n.expiresAt === null || Date.parse(n.expiresAt) > Date.parse(n.publishAt), {
    message: "expiresAt must be after publishAt",
    path: ["expiresAt"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Notice = z.infer<typeof NoticeSchema>;

export const MeetingModeSchema = z.enum(["in_person", "video", "phone"]);
export type MeetingMode = z.infer<typeof MeetingModeSchema>;

/** Parent–teacher meeting (PTM) bookable slot (M24). */
export const MeetingSlotSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    staffProfileId: IdSchema,
    date: IsoDateSchema,
    start: TimeOfDaySchema,
    end: TimeOfDaySchema,
    mode: MeetingModeSchema,
    location: z.string().max(120).nullable(),
    capacity: z.int().min(1).max(10),
  })
  .refine((slot) => slot.end > slot.start, {
    message: "end must be after start",
    path: ["end"],
  });
export type MeetingSlot = z.infer<typeof MeetingSlotSchema>;

export const MeetingBookingStatusSchema = z.enum(["booked", "cancelled", "attended", "no_show"]);
export type MeetingBookingStatus = z.infer<typeof MeetingBookingStatusSchema>;

/**
 * Guardian booking for a PTM slot (M24).
 * `note` is personal data (G-6, V-7) and must never be logged.
 */
export const MeetingBookingSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    slotId: IdSchema,
    guardianPersonId: IdSchema,
    learnerId: IdSchema,
    status: MeetingBookingStatusSchema,
    /** Personal data (G-6, V-7); never log or emit in telemetry. */
    note: z.string().max(300).nullable(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type MeetingBooking = z.infer<typeof MeetingBookingSchema>;
