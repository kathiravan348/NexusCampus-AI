import {
  BellScheduleSchema,
  PAGE_SIZE_MAX,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const RoomPage = pageSchema(RoomSchema);
const BellSchedulePage = pageSchema(BellScheduleSchema);
const TimetableSlotPage = pageSchema(TimetableSlotSchema);
const TeacherLoadPage = pageSchema(TeacherLoadSchema);

export function useRooms() {
  return useScopedQuery(queryKeys.m16.rooms, (c, signal) =>
    c.get("/rooms", RoomPage, all, { signal }),
  );
}

export function useBellSchedules() {
  return useScopedQuery(queryKeys.m16.bellSchedules, (c, signal) =>
    c.get("/bell-schedules", BellSchedulePage, all, { signal }),
  );
}

export function useTimetableSlots(
  classGroupId: string | null = null,
  staffProfileId: string | null = null,
) {
  return useScopedQuery(
    (s) => queryKeys.m16.timetableSlots(s, classGroupId, staffProfileId),
    (c, signal) =>
      c.get(
        "/timetable-slots",
        TimetableSlotPage,
        { ...all, classGroupId, staffProfileId },
        { signal },
      ),
  );
}

export function useTeacherLoad(academicYearId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m16.teacherLoad(s, academicYearId),
    (c, signal) => c.get("/teacher-load", TeacherLoadPage, { ...all, academicYearId }, { signal }),
  );
}
