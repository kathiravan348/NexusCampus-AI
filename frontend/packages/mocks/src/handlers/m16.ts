import {
  BellScheduleSchema,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotInputSchema,
  TimetableSlotSchema,
  pageSchema,
  type TeacherLoad,
  type TimetableSlot,
  type TimetableSlotInput,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import {
  ApiFailure,
  entitled,
  failureResponse,
  familyOf,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, param } from "./route";

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

function timesOverlap(
  a: { readonly start: string; readonly end: string },
  b: { readonly start: string; readonly end: string },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function datesOverlap(
  a: { readonly effectiveFrom: string; readonly effectiveTo: string | null },
  b: { readonly effectiveFrom: string; readonly effectiveTo: string | null },
): boolean {
  return (
    (a.effectiveTo === null || a.effectiveTo >= b.effectiveFrom) &&
    (b.effectiveTo === null || b.effectiveTo >= a.effectiveFrom)
  );
}

async function readSlotInput(request: Request): Promise<TimetableSlotInput> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = TimetableSlotInputSchema.safeParse(raw);
  if (!parsed.success) {
    const paths = new Set(parsed.error.issues.map(({ path }) => path[0]));
    const details = Object.keys(TimetableSlotInputSchema.shape)
      .filter((key) => paths.has(key))
      .map((key) => ({ path: key, message: "Invalid timetable slot field" }));
    throw new ApiFailure("invalid_request", details.length > 0 ? details : undefined);
  }
  return parsed.data;
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
  http.post(`*${API_BASE}/timetable-slots`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      const { tenantId } = viewer;
      if (!entitled(tenantId, "M16")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m16.timetable.manage")) throw new ApiFailure("forbidden");

      const input = await readSlotInput(request);
      const calendar = ofTenant(mockDb.calendars, tenantId).find(
        (row) => row.id === input.academicYearId,
      );
      if (!calendar) {
        throw new ApiFailure("invalid_request", [
          { path: "academicYearId", message: "Academic year does not belong to this tenant" },
        ]);
      }
      if (input.periodId !== null && !calendar.periods.some((p) => p.id === input.periodId)) {
        throw new ApiFailure("invalid_request", [
          { path: "periodId", message: "Academic period does not belong to this academic year" },
        ]);
      }
      const offerings = ofTenant(mockDb.subjectOfferings, tenantId);
      const offering = offerings.find((row) => row.id === input.subjectOfferingId);
      if (!offering) {
        throw new ApiFailure("invalid_request", [
          { path: "subjectOfferingId", message: "Subject offering does not belong to this tenant" },
        ]);
      }
      if (offering.academicYearId !== input.academicYearId) {
        throw new ApiFailure("invalid_request", [
          { path: "academicYearId", message: "Academic year does not match subject offering" },
        ]);
      }
      if (
        input.roomId !== null &&
        !ofTenant(mockDb.rooms, tenantId).some((row) => row.id === input.roomId)
      ) {
        throw new ApiFailure("invalid_request", [
          { path: "roomId", message: "Room does not belong to this tenant" },
        ]);
      }
      const staffIds = new Set(
        ofTenant(mockDb.roleProfiles, tenantId)
          .filter((row) => row.kind === "staff")
          .map((row) => row.id),
      );
      if (input.staffProfileIds.some((id) => !staffIds.has(id))) {
        throw new ApiFailure("invalid_request", [
          { path: "staffProfileIds", message: "Staff profile does not belong to this tenant" },
        ]);
      }

      const overlapping = ofTenant(mockDb.timetableSlots, tenantId).filter(
        (other) =>
          other.weekday === input.weekday &&
          timesOverlap(input, other) &&
          datesOverlap(input, other),
      );
      if (input.roomId !== null && overlapping.some((other) => other.roomId === input.roomId)) {
        throw new ApiFailure("conflict", [
          { path: "roomId", message: "Room is already booked at this time" },
        ]);
      }
      if (
        input.staffProfileIds.length > 0 &&
        overlapping.some((other) =>
          input.staffProfileIds.some((id) => other.staffProfileIds.includes(id)),
        )
      ) {
        throw new ApiFailure("conflict", [
          { path: "staffProfileIds", message: "Staff member is already scheduled at this time" },
        ]);
      }
      const offeringClassGroup = new Map(offerings.map((row) => [row.id, row.classGroupId]));
      if (
        overlapping.some(
          (other) => offeringClassGroup.get(other.subjectOfferingId) === offering.classGroupId,
        )
      ) {
        throw new ApiFailure("conflict", [
          { path: "subjectOfferingId", message: "Class group already has a slot at this time" },
        ]);
      }

      const now = new Date().toISOString();
      const created = TimetableSlotSchema.parse({
        ...input,
        id: `tts-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.timetableSlots.push(created);
      return HttpResponse.json(created as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
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
