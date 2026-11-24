import type {
  AttendanceMark,
  AttendanceSession,
  BellSchedule,
  LeaveRequest,
  Room,
  RoomKind,
  TimetableSlot,
} from "@nexus/contracts";
import { CLASS_GROUPS, SUBJECT_OFFERINGS } from "./academics";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CAMPUS, INSTITUTION, TENANT } from "./ids";
import {
  attendanceMarkId,
  attendanceSessionId,
  BELL_SCHEDULE,
  CLASS_GROUP,
  LEAVE_REQUEST,
  type OpsTenantSlug,
  ROOM,
  timetableSlotId,
} from "./ids-stage3";
import { ENROLMENTS, LEARNERS } from "./learner-records";
import { GUARDIAN_LINKS } from "./role-profiles";
import { DEVICE } from "./sync";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

type RoomSpec = readonly [
  id: string,
  tenantId: string,
  institutionId: string,
  campusId: string,
  code: string,
  name: string,
  kind: RoomKind,
  capacity: number,
];

const LS = TENANT.littleSteps;
const RV = TENANT.riverside;
const NB = TENANT.northbridge;
const AX = TENANT.apex;
const HM = TENANT.harmony;
const I = INSTITUTION;
const C = CAMPUS;
const RV_I = I.riversideSchool;
const RV_N = C.riversideNorth;
const RV_S = C.riversideSouth;

const ROOM_SPECS: readonly RoomSpec[] = [
  [ROOM.ls[0], LS, I.littleSteps, C.littleSteps, "R101", "Sunbeam Room", "classroom", 18],
  [ROOM.ls[1], LS, I.littleSteps, C.littleSteps, "R102", "Garden Playroom", "other", 20],
  [ROOM.rvNorth[0], RV, RV_I, RV_N, "N101", "North Room 101", "classroom", 30],
  [ROOM.rvNorth[1], RV, RV_I, RV_N, "N102", "North Science Lab", "lab", 28],
  [ROOM.rvSouth[0], RV, RV_I, RV_S, "S101", "South Room 101", "classroom", 30],
  [ROOM.rvSouth[1], RV, RV_I, RV_S, "S102", "South Activity Hall", "hall", 40],
  [ROOM.nb[0], NB, I.northbridge, C.northbridge, "CS101", "Lecture Hall A", "hall", 80],
  [ROOM.nb[1], NB, I.northbridge, C.northbridge, "CSLAB1", "Computing Lab 1", "lab", 40],
  [ROOM.ax[0], AX, I.apex, C.apex, "A101", "Lecture Room 1", "classroom", 30],
  [ROOM.ax[1], AX, I.apex, C.apex, "A102", "Physics Room 2", "classroom", 30],
  [ROOM.hm[0], HM, I.harmony, C.harmony, "ST1", "Studio 1", "classroom", 12],
  [ROOM.hm[1], HM, I.harmony, C.harmony, "ST2", "Recital Room", "hall", 20],
];

export const ROOMS: readonly Room[] = ROOM_SPECS.map(
  ([id, tenantId, institutionId, campusId, code, name, kind, capacity]) => ({
    id,
    tenantId,
    institutionId,
    campusId,
    code,
    name,
    kind,
    capacity,
    active: true,
    ...timestamps,
  }),
);

const STANDARD_PERIODS: BellSchedule["periods"] = [
  { code: "P1", label: "Period 1", start: "09:00", end: "09:50", isBreak: false },
  { code: "P2", label: "Period 2", start: "10:00", end: "10:50", isBreak: false },
  { code: "BRK", label: "Break", start: "10:50", end: "11:10", isBreak: true },
  { code: "P3", label: "Period 3", start: "11:10", end: "12:00", isBreak: false },
  { code: "P4", label: "Period 4", start: "13:00", end: "13:50", isBreak: false },
];

const SCHEDULE_SPECS: readonly [OpsTenantSlug, string, string][] = [
  ["ls", LS, INSTITUTION.littleSteps],
  ["rv", RV, INSTITUTION.riversideSchool],
  ["nb", NB, INSTITUTION.northbridge],
  ["ax", AX, INSTITUTION.apex],
  ["hm", HM, INSTITUTION.harmony],
];

export const BELL_SCHEDULES: readonly BellSchedule[] = SCHEDULE_SPECS.map(
  ([slug, tenantId, institutionId]) => ({
    id: BELL_SCHEDULE[slug],
    tenantId,
    institutionId,
    name: "Standard Weekday Bell Schedule",
    periods: STANDARD_PERIODS,
    ...timestamps,
  }),
);

/**
 * 3 non-overlapping slots per class group (Mon–Wed). Groups on the same campus alternate
 * 09:00–09:50 and 10:00–10:50 so neither rooms nor shared teachers ever clash.
 */
const campusGroupIndex = new Map<string, number>();

export const TIMETABLE_SLOTS: readonly TimetableSlot[] = CLASS_GROUPS.flatMap((group) => {
  const calendar = ACADEMIC_CALENDARS.find((c) => c.id === group.academicYearId);
  const offerings = SUBJECT_OFFERINGS.filter((o) => o.classGroupId === group.id);
  const campusRooms = ROOMS.filter(
    (r) => r.tenantId === group.tenantId && r.campusId === group.campusId,
  );
  const [firstOff, secondOff] = offerings;
  const [firstRoom, secondRoom] = campusRooms;
  if (!calendar || !firstOff || !secondOff || !firstRoom || !secondRoom) {
    throw new Error(`Incomplete timetable references for ${group.id}`);
  }
  const campusKey = `${group.tenantId}:${group.campusId ?? "none"}`;
  const idx = campusGroupIndex.get(campusKey) ?? 0;
  campusGroupIndex.set(campusKey, idx + 1);
  const start = idx % 2 === 0 ? "09:00" : "10:00";
  const end = idx % 2 === 0 ? "09:50" : "10:50";
  const plan: readonly [number, typeof firstOff, string][] = [
    [1, firstOff, idx % 2 === 0 ? firstRoom.id : secondRoom.id],
    [2, secondOff, idx % 2 === 0 ? secondRoom.id : firstRoom.id],
    [3, firstOff, idx % 2 === 0 ? firstRoom.id : secondRoom.id],
  ];
  return plan.map(([weekday, offering, roomId], slotIndex) => ({
    id: timetableSlotId(group.id, slotIndex + 1),
    tenantId: group.tenantId,
    academicYearId: group.academicYearId,
    periodId: null,
    subjectOfferingId: offering.id,
    weekday,
    start,
    end,
    roomId,
    staffProfileIds: [...offering.staffProfileIds],
    effectiveFrom: calendar.startsOn,
    effectiveTo: calendar.endsOn,
    ...timestamps,
  }));
});

const SCHOOL_DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"] as const;

const ATTENDANCE_SPECS: readonly [OpsTenantSlug, string, string][] = [
  ["ls", CLASS_GROUP.lsSeedlings, DEVICE.lsArjunTablet],
  ["rv", CLASS_GROUP.rvNorthYearTen, DEVICE.rvNorthTablet],
  ["nb", CLASS_GROUP.nbFirstYear, DEVICE.nbRobertMac],
  ["ax", CLASS_GROUP.axFoundation, DEVICE.axMeenaLaptop],
  ["hm", CLASS_GROUP.hmBeginner, DEVICE.hmDanielTablet],
];

const attendanceBuilt = ATTENDANCE_SPECS.map(([slug, classGroupId, deviceId]) => {
  const group = CLASS_GROUPS.find((g) => g.id === classGroupId);
  if (!group || group.homeroomStaffProfileId === null) {
    throw new Error(`Missing class group or homeroom for ${classGroupId}`);
  }
  const staffId = group.homeroomStaffProfileId;
  const learnerIds = ENROLMENTS.filter(
    (e) => e.classGroupId === classGroupId && e.status === "active",
  ).map((e) => e.learnerId);

  const sessions: AttendanceSession[] = SCHOOL_DAYS.map((date, dayIdx) => {
    const isOpen = dayIdx === SCHOOL_DAYS.length - 1;
    return {
      id: attendanceSessionId(slug, dayIdx + 1),
      tenantId: group.tenantId,
      institutionId: group.institutionId,
      mode: "daily",
      date,
      classGroupId: group.id,
      timetableSlotId: null,
      eventLabel: null,
      takenByStaffProfileId: staffId,
      status: isOpen ? "open" : "submitted",
      submittedAt: isOpen ? null : `${date}T10:00:00Z`,
      createdAt: `${date}T08:45:00Z`,
      updatedAt: isOpen ? `${date}T09:15:00Z` : `${date}T10:00:00Z`,
    };
  });

  const marks: AttendanceMark[] = sessions.flatMap((session, dayIdx) =>
    learnerIds.map((learnerId, learnerIdx) => {
      const isLate = dayIdx === 1 && learnerIdx === 0;
      const isAbsent = dayIdx === 2 && learnerIdx === 0;
      return {
        id: attendanceMarkId(session.id, learnerId),
        tenantId: group.tenantId,
        sessionId: session.id,
        learnerId,
        status: isLate ? "late" : isAbsent ? "absent" : "present",
        method: "manual",
        minutesLate: isLate ? 10 : null,
        note: isLate
          ? "Arrived after morning assembly."
          : isAbsent
            ? "Family notified the office."
            : null,
        markedAt: `${session.date}T09:05:00Z`,
        markedByStaffProfileId: staffId,
        deviceId: dayIdx === 0 && learnerIdx === 0 ? deviceId : null,
      };
    }),
  );

  const learner = LEARNERS.find((l) => l.id === learnerIds[0]);
  if (!learner) throw new Error(`Missing learner for ${classGroupId}`);
  const guardian = GUARDIAN_LINKS.find(
    (l) => l.tenantId === group.tenantId && l.learnerPersonId === learner.personId,
  );
  const requesterId = guardian?.guardianPersonId ?? learner.personId;
  const [reqOneId, reqTwoId] = LEAVE_REQUEST[slug];
  const leaves: LeaveRequest[] = [
    {
      id: reqOneId,
      tenantId: group.tenantId,
      learnerId: learner.id,
      requestedByPersonId: requesterId,
      from: "2026-11-18",
      to: "2026-11-18",
      reason: "Family travel day.",
      status: "approved",
      decidedByStaffProfileId: staffId,
      decidedAt: "2026-11-15T10:00:00Z",
      createdAt: "2026-11-14T09:00:00Z",
      updatedAt: "2026-11-15T10:00:00Z",
    },
    {
      id: reqTwoId,
      tenantId: group.tenantId,
      learnerId: learner.id,
      requestedByPersonId: requesterId,
      from: "2026-11-27",
      to: "2026-11-28",
      reason: "Scheduled dental appointment.",
      status: "pending",
      decidedByStaffProfileId: null,
      decidedAt: null,
      createdAt: "2026-11-19T09:00:00Z",
      updatedAt: "2026-11-19T09:00:00Z",
    },
  ];
  return { sessions, marks, leaves };
});

export const ATTENDANCE_SESSIONS: readonly AttendanceSession[] = attendanceBuilt.flatMap(
  (b) => b.sessions,
);
export const ATTENDANCE_MARKS: readonly AttendanceMark[] = attendanceBuilt.flatMap((b) => b.marks);
export const LEAVE_REQUESTS: readonly LeaveRequest[] = attendanceBuilt.flatMap((b) => b.leaves);
