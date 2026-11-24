import type {
  MeetingBooking,
  MeetingSlot,
  MessageThread,
  Notice,
  ThreadMessage,
} from "@nexus/contracts";
import { INSTITUTION, PERSON, TENANT } from "./ids";
import {
  CLASS_GROUP,
  LEARNER,
  MEETING_BOOKING,
  MEETING_SLOT,
  MESSAGE_THREAD,
  NOTICE,
  type OpsTenantSlug,
  threadMessageId,
} from "./ids-stage3";
import { ROLE_PROFILES } from "./role-profiles";

interface CommTenantSpec {
  readonly slug: OpsTenantSlug;
  readonly tenantId: string;
  readonly institutionId: string;
  readonly classGroupId: string;
  readonly adminPersonId: string;
  readonly teacherPersonId: string;
  readonly guardianPersonId: string;
  readonly learnerId: string;
}

const COMM_SPECS: readonly CommTenantSpec[] = [
  {
    slug: "ls",
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    classGroupId: CLASS_GROUP.lsSeedlings,
    adminPersonId: PERSON.lsPriya,
    teacherPersonId: PERSON.lsArjun,
    guardianPersonId: PERSON.lsSunita,
    learnerId: LEARNER.lsIshaan,
  },
  {
    slug: "rv",
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    classGroupId: CLASS_GROUP.rvNorthYearTen,
    adminPersonId: PERSON.rvHelen,
    teacherPersonId: PERSON.rvTom,
    guardianPersonId: PERSON.rvGrace,
    learnerId: LEARNER.rvOliver,
  },
  {
    slug: "nb",
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    classGroupId: CLASS_GROUP.nbFirstYear,
    adminPersonId: PERSON.nbRobert,
    teacherPersonId: PERSON.nbElena,
    guardianPersonId: PERSON.nbPatricia,
    learnerId: LEARNER.nbSofia,
  },
  {
    slug: "ax",
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    classGroupId: CLASS_GROUP.axFoundation,
    adminPersonId: PERSON.axKarthik,
    teacherPersonId: PERSON.axMeena,
    guardianPersonId: PERSON.axLakshmi,
    learnerId: LEARNER.axDivya,
  },
  {
    slug: "hm",
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    classGroupId: CLASS_GROUP.hmBeginner,
    adminPersonId: PERSON.hmWeiLing,
    teacherPersonId: PERSON.hmDaniel,
    guardianPersonId: PERSON.hmMei,
    learnerId: LEARNER.hmChloe,
  },
];

function staffProfileId(tenantId: string, personId: string): string {
  const row = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === "staff",
  );
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
}

const built = COMM_SPECS.map((spec) => {
  const { slug, tenantId, institutionId, classGroupId } = spec;
  const adminStaffId = staffProfileId(tenantId, spec.adminPersonId);
  const teacherStaffId = staffProfileId(tenantId, spec.teacherPersonId);
  const [groupThreadId, directThreadId] = MESSAGE_THREAD[slug];
  const groupParticipants = [spec.teacherPersonId, spec.guardianPersonId];
  const directParticipants = [spec.adminPersonId, spec.guardianPersonId];

  const threads: MessageThread[] = [
    {
      id: groupThreadId,
      tenantId,
      institutionId,
      kind: "class_group",
      subject: "Weekly class updates",
      participantPersonIds: groupParticipants,
      classGroupId,
      lastMessageAt: "2026-11-18T10:30:00Z",
      archived: false,
      createdAt: "2026-11-16T08:00:00Z",
      updatedAt: "2026-11-18T10:30:00Z",
    },
    {
      id: directThreadId,
      tenantId,
      institutionId,
      kind: "direct",
      subject: "Schedule follow-up",
      participantPersonIds: directParticipants,
      classGroupId: null,
      lastMessageAt: "2026-11-19T09:15:00Z",
      archived: false,
      createdAt: "2026-11-18T08:00:00Z",
      updatedAt: "2026-11-19T09:15:00Z",
    },
  ];

  const messages: ThreadMessage[] = [
    {
      id: threadMessageId(groupThreadId, 1),
      tenantId,
      threadId: groupThreadId,
      senderPersonId: spec.teacherPersonId,
      body: "Please note the updated classroom timetable for this week.",
      attachmentIds: [],
      sentAt: "2026-11-17T09:00:00Z",
      editedAt: null,
      readByPersonIds: [...groupParticipants],
      deviceId: null,
    },
    {
      id: threadMessageId(groupThreadId, 2),
      tenantId,
      threadId: groupThreadId,
      senderPersonId: spec.guardianPersonId,
      body: "Thank you for sharing the timetable update.",
      attachmentIds: [],
      sentAt: "2026-11-18T10:30:00Z",
      editedAt: null,
      readByPersonIds: [spec.guardianPersonId],
      deviceId: null,
    },
    {
      id: threadMessageId(directThreadId, 1),
      tenantId,
      threadId: directThreadId,
      senderPersonId: spec.guardianPersonId,
      body: "Could we confirm the meeting time for next week?",
      attachmentIds: [],
      sentAt: "2026-11-18T15:00:00Z",
      editedAt: null,
      readByPersonIds: [...directParticipants],
      deviceId: null,
    },
    {
      id: threadMessageId(directThreadId, 2),
      tenantId,
      threadId: directThreadId,
      senderPersonId: spec.adminPersonId,
      body: "Yes, the afternoon slot is open and ready to book.",
      attachmentIds: [],
      sentAt: "2026-11-19T09:15:00Z",
      editedAt: null,
      readByPersonIds: [spec.adminPersonId],
      deviceId: null,
    },
  ];

  const [publishedNoticeId, scheduledNoticeId] = NOTICE[slug];
  const notices: Notice[] = [
    {
      id: publishedNoticeId,
      tenantId,
      institutionId,
      title: "Term calendar reminder",
      body: "Please review the term calendar and upcoming community events.",
      audience: { kind: "everyone", ids: [] },
      channels: ["in_app", "email"],
      requiresAcknowledgement: false,
      publishAt: "2026-11-10T08:00:00Z",
      expiresAt: "2026-12-20T23:59:00Z",
      status: "published",
      createdByStaffProfileId: adminStaffId,
      createdAt: "2026-11-09T09:00:00Z",
      updatedAt: "2026-11-10T08:00:00Z",
    },
    {
      id: scheduledNoticeId,
      tenantId,
      institutionId,
      title: "Family and teacher review sessions",
      body: "Booking slots for the upcoming review meetings will open shortly.",
      audience: { kind: "class_groups", ids: [classGroupId] },
      channels: ["in_app"],
      requiresAcknowledgement: true,
      publishAt: "2026-12-01T08:00:00Z",
      expiresAt: null,
      status: "scheduled",
      createdByStaffProfileId: adminStaffId,
      createdAt: "2026-11-18T09:00:00Z",
      updatedAt: "2026-11-18T09:00:00Z",
    },
  ];

  const [slotOneId, slotTwoId] = MEETING_SLOT[slug];
  const meetingSlots: MeetingSlot[] = [
    {
      id: slotOneId,
      tenantId,
      staffProfileId: teacherStaffId,
      date: "2026-11-25",
      start: "14:00",
      end: "14:20",
      mode: "in_person",
      location: "Conference Room A",
      capacity: 1,
    },
    {
      id: slotTwoId,
      tenantId,
      staffProfileId: teacherStaffId,
      date: "2026-11-25",
      start: "14:30",
      end: "14:50",
      mode: "video",
      location: null,
      capacity: 1,
    },
  ];

  const booking: MeetingBooking = {
    id: MEETING_BOOKING[slug],
    tenantId,
    slotId: slotOneId,
    guardianPersonId: spec.guardianPersonId,
    learnerId: spec.learnerId,
    status: "booked",
    note: "Discuss term learning goals.",
    createdAt: "2026-11-19T10:00:00Z",
    updatedAt: "2026-11-19T10:00:00Z",
  };

  return { threads, messages, notices, meetingSlots, booking };
});

export const MESSAGE_THREADS: readonly MessageThread[] = built.flatMap((b) => b.threads);
export const THREAD_MESSAGES: readonly ThreadMessage[] = built.flatMap((b) => b.messages);
export const NOTICES: readonly Notice[] = built.flatMap((b) => b.notices);
export const MEETING_SLOTS: readonly MeetingSlot[] = built.flatMap((b) => b.meetingSlots);
export const MEETING_BOOKINGS: readonly MeetingBooking[] = built.map((b) => b.booking);
