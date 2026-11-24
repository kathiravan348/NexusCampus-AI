import { describe, expect, it } from "vitest";
import {
  MeetingBookingSchema,
  MeetingSlotSchema,
  MessageThreadSchema,
  NoticeSchema,
  ThreadMessageSchema,
} from "./communication";

const classGroupThread = {
  id: "thr-1",
  tenantId: "ten-1",
  institutionId: "inst-1",
  kind: "class_group",
  subject: "Grade 5A Science Fair updates",
  participantPersonIds: ["per-teacher-1", "per-parent-1", "per-parent-2"],
  classGroupId: "cg-5a",
  lastMessageAt: "2026-11-24T08:15:00Z",
  archived: false,
  createdAt: "2026-11-20T06:00:00Z",
  updatedAt: "2026-11-24T08:15:00Z",
};

const threadMessage = {
  id: "msg-1",
  tenantId: "ten-1",
  threadId: "thr-1",
  senderPersonId: "per-teacher-1",
  body: "Please send the project poster board by Thursday morning.",
  attachmentIds: ["att-1"],
  sentAt: "2026-11-24T08:15:00Z",
  editedAt: "2026-11-24T08:20:00Z",
  readByPersonIds: ["per-teacher-1", "per-parent-1"],
  deviceId: "dev-android-1",
};

const scheduledNotice = {
  id: "not-1",
  tenantId: "ten-1",
  institutionId: "inst-1",
  title: "Winter uniform reminder",
  body: "Winter uniform is required from December 1 for Grades 5A and 5B.",
  audience: {
    kind: "class_groups",
    ids: ["cg-5a", "cg-5b"],
  },
  channels: ["sms", "push"],
  requiresAcknowledgement: true,
  publishAt: "2026-11-25T03:30:00Z",
  expiresAt: "2026-12-05T18:30:00Z",
  status: "scheduled",
  createdByStaffProfileId: "rp-staff-1",
  createdAt: "2026-11-24T05:00:00Z",
  updatedAt: "2026-11-24T05:10:00Z",
};

const ptmSlot = {
  id: "slot-1",
  tenantId: "ten-1",
  staffProfileId: "rp-staff-1",
  date: "2026-11-28",
  start: "09:30",
  end: "09:45",
  mode: "in_person",
  location: "Room 204",
  capacity: 1,
};

const ptmBooking = {
  id: "book-1",
  tenantId: "ten-1",
  slotId: "slot-1",
  guardianPersonId: "per-parent-1",
  learnerId: "lrn-1",
  status: "booked",
  note: "Would like to discuss maths progress.",
  createdAt: "2026-11-24T07:00:00Z",
  updatedAt: "2026-11-24T07:00:00Z",
};

const fails = (result: { success: boolean }) => expect(result.success).toBe(false);

describe("MessageThreadSchema and ThreadMessageSchema", () => {
  it("accepts a class-group thread with a read receipt message", () => {
    expect(MessageThreadSchema.parse(classGroupThread)).toEqual(classGroupThread);
    expect(ThreadMessageSchema.parse(threadMessage)).toEqual(threadMessage);
  });

  it("allows a broadcast thread with a single participant and null classGroupId", () => {
    const broadcast = {
      ...classGroupThread,
      id: "thr-2",
      kind: "broadcast",
      participantPersonIds: ["per-principal-1"],
      classGroupId: null,
      lastMessageAt: null,
    };
    expect(MessageThreadSchema.parse(broadcast)).toEqual(broadcast);
  });

  it("rejects class_group without classGroupId and non-class_group with it", () => {
    fails(MessageThreadSchema.safeParse({ ...classGroupThread, classGroupId: null }));
    const directWithGroup = { ...classGroupThread, kind: "direct", classGroupId: "cg-5a" };
    fails(MessageThreadSchema.safeParse(directWithGroup));
  });

  it("rejects too few or duplicate participants and bad timestamps", () => {
    const solo = { ...classGroupThread, participantPersonIds: ["per-teacher-1"] };
    const dupes = { ...classGroupThread, participantPersonIds: ["per-1", "per-1"] };
    const earlyUpdate = { ...classGroupThread, updatedAt: "2026-11-19T00:00:00Z" };
    fails(MessageThreadSchema.safeParse(solo));
    fails(MessageThreadSchema.safeParse(dupes));
    fails(MessageThreadSchema.safeParse(earlyUpdate));
    fails(MessageThreadSchema.safeParse({ ...classGroupThread, extra: true }));
  });

  it("rejects editedAt before sentAt, duplicate lists, and extra keys on messages", () => {
    const badEdit = { ...threadMessage, editedAt: "2026-11-24T08:14:59Z" };
    const dupeAttachments = { ...threadMessage, attachmentIds: ["att-1", "att-1"] };
    const dupeReaders = { ...threadMessage, readByPersonIds: ["per-1", "per-1"] };
    fails(ThreadMessageSchema.safeParse(badEdit));
    fails(ThreadMessageSchema.safeParse(dupeAttachments));
    fails(ThreadMessageSchema.safeParse(dupeReaders));
    fails(ThreadMessageSchema.safeParse({ ...threadMessage, extra: true }));
  });
});

describe("NoticeSchema", () => {
  it("accepts a scheduled notice to two class groups over SMS and push", () => {
    expect(NoticeSchema.parse(scheduledNotice)).toEqual(scheduledNotice);
  });

  it("accepts a notice to everyone with empty ids and null expiresAt", () => {
    const notice = {
      ...scheduledNotice,
      id: "not-2",
      audience: { kind: "everyone", ids: [] },
      expiresAt: null,
      status: "published",
    };
    expect(NoticeSchema.parse(notice)).toEqual(notice);
  });

  it("rejects audience everyone with ids and non-everyone with empty ids", () => {
    const everyoneWithIds = {
      ...scheduledNotice,
      audience: { kind: "everyone", ids: ["cg-5a"] },
    };
    const rolesEmpty = {
      ...scheduledNotice,
      audience: { kind: "roles", ids: [] },
    };
    fails(NoticeSchema.safeParse(everyoneWithIds));
    fails(NoticeSchema.safeParse(rolesEmpty));
  });

  it("rejects expiresAt <= publishAt, duplicate channels, and extra keys", () => {
    const sameExpiry = { ...scheduledNotice, expiresAt: scheduledNotice.publishAt };
    const earlierExpiry = { ...scheduledNotice, expiresAt: "2026-11-25T03:00:00Z" };
    const dupeChannels = { ...scheduledNotice, channels: ["sms", "sms"] };
    const extraAudience = {
      ...scheduledNotice,
      audience: { ...scheduledNotice.audience, extra: "nope" },
    };
    fails(NoticeSchema.safeParse(sameExpiry));
    fails(NoticeSchema.safeParse(earlierExpiry));
    fails(NoticeSchema.safeParse(dupeChannels));
    fails(NoticeSchema.safeParse({ ...scheduledNotice, extra: "nope" }));
    fails(NoticeSchema.safeParse(extraAudience));
  });
});

describe("MeetingSlotSchema and MeetingBookingSchema", () => {
  it("accepts a PTM slot with a booking", () => {
    expect(MeetingSlotSchema.parse(ptmSlot)).toEqual(ptmSlot);
    expect(MeetingBookingSchema.parse(ptmBooking)).toEqual(ptmBooking);
  });

  it("rejects end <= start, invalid capacity, bad timestamps, and extra keys", () => {
    fails(MeetingSlotSchema.safeParse({ ...ptmSlot, end: ptmSlot.start }));
    fails(MeetingSlotSchema.safeParse({ ...ptmSlot, end: "09:15" }));
    fails(MeetingSlotSchema.safeParse({ ...ptmSlot, capacity: 0 }));
    fails(MeetingSlotSchema.safeParse({ ...ptmSlot, capacity: 11 }));
    fails(MeetingSlotSchema.safeParse({ ...ptmSlot, extra: 1 }));
    const earlyBookingUpdate = { ...ptmBooking, updatedAt: "2026-11-23T00:00:00Z" };
    fails(MeetingBookingSchema.safeParse(earlyBookingUpdate));
    fails(MeetingBookingSchema.safeParse({ ...ptmBooking, extra: 1 }));
  });
});
