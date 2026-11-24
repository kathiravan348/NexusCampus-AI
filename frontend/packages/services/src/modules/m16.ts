import {
  BellScheduleSchema,
  PAGE_SIZE_MAX,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotSchema,
  pageSchema,
  type TimetableSlot,
  type TimetableSlotInput,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

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

/** Creates a timetable slot (M16, L1: online save) and invalidates all M16 queries for the session. */
export function useCreateTimetableSlot() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<TimetableSlot, Error, TimetableSlotInput>({
    mutationFn: (body) => client.send("POST", "/timetable-slots", body, TimetableSlotSchema),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m16.rooms(session).slice(0, -1) });
    },
  });
}
