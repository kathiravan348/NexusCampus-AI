import {
  BellScheduleSchema,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotSchema,
  pageSchema,
  type TeacherLoad,
  type TimetableSlot,
} from "@nexus/contracts";
import { ApiFailure, familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, param } from "./route";

const M = { module: "M16", permission: "m16.timetable.read" } as const;

function isStaff(viewer: Viewer): boolean {
  return ofTenant(mockDb.roleProfiles, viewer.tenantId).some(
    (profile) => profile.personId === viewer.personId && profile.kind === "staff",
  );
}

function familyClassGroups(viewer: Viewer) {
  const family = familyOf(viewer);
  const learnerIds = new Set(
    ofTenant(mockDb.learners, viewer.tenantId)
      .filter((learner) => family.has(learner.personId))
      .map((learner) => learner.id),
  );
  return new Set(
    ofTenant(mockDb.enrolments, viewer.tenantId)
      .filter((row) => row.status === "active" && learnerIds.has(row.learnerId))
      .map((row) => row.classGroupId),
  );
}

function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function teacherLoads(slots: readonly TimetableSlot[]): TeacherLoad[] {
  const loads = new Map<string, TeacherLoad>();
  for (const { academicYearId, periodId, staffProfileIds, start, end } of slots) {
    const duration = minutes(end) - minutes(start);
    for (const staffProfileId of staffProfileIds) {
      const key = JSON.stringify([staffProfileId, academicYearId, periodId]);
      const load = loads.get(key) ?? {
        staffProfileId,
        academicYearId,
        periodId,
        weeklyPeriods: 0,
        weeklyMinutes: 0,
        maxWeeklyPeriods: null,
        overloaded: false,
      };
      load.weeklyPeriods += 1;
      load.weeklyMinutes += duration;
      loads.set(key, load);
    }
  }
  return [...loads.values()];
}

export const m16Handlers = [
  get("/rooms", M, (ctx) =>
    list(ctx, ofTenant(mockDb.rooms, ctx.viewer.tenantId), pageSchema(RoomSchema)),
  ),
  get("/bell-schedules", M, (ctx) => {
    const schedules = ofTenant(mockDb.bellSchedules, ctx.viewer.tenantId);
    return list(ctx, schedules, pageSchema(BellScheduleSchema));
  }),
  get("/timetable-slots", M, (ctx) => {
    const { viewer, url } = ctx;
    const classGroupId = param(url, "classGroupId");
    const staffProfileId = param(url, "staffProfileId");
    if (classGroupId !== null) {
      const groups = ofTenant(mockDb.classGroups, viewer.tenantId);
      found(groups.find((row) => row.id === classGroupId));
    }
    if (staffProfileId !== null) {
      found(
        ofTenant(mockDb.roleProfiles, viewer.tenantId).find(
          (row) => row.kind === "staff" && row.id === staffProfileId,
        ),
      );
    }
    const classGroups = isStaff(viewer) ? null : familyClassGroups(viewer);
    const offeringIds = new Set(
      ofTenant(mockDb.subjectOfferings, viewer.tenantId)
        .filter(
          (row) =>
            (classGroupId === null || row.classGroupId === classGroupId) &&
            (classGroups === null || classGroups.has(row.classGroupId)),
        )
        .map((row) => row.id),
    );
    const slots = ofTenant(mockDb.timetableSlots, viewer.tenantId).filter(
      (row) =>
        offeringIds.has(row.subjectOfferingId) &&
        (staffProfileId === null || row.staffProfileIds.includes(staffProfileId)),
    );
    return list(ctx, slots, pageSchema(TimetableSlotSchema));
  }),
  get("/teacher-load", M, (ctx) => {
    if (!isStaff(ctx.viewer)) throw new ApiFailure("forbidden");
    const academicYearId = param(ctx.url, "academicYearId");
    const { tenantId } = ctx.viewer;
    if (academicYearId !== null) {
      found(ofTenant(mockDb.calendars, tenantId).find((row) => row.id === academicYearId));
    }
    const slots = ofTenant(mockDb.timetableSlots, tenantId).filter(
      (row) => academicYearId === null || row.academicYearId === academicYearId,
    );
    return list(ctx, teacherLoads(slots), pageSchema(TeacherLoadSchema));
  }),
];
