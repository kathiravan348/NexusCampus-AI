import { CALENDAR, CLASS_GROUP } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { useBellSchedules, useRooms, useTeacherLoad, useTimetableSlots } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M16 hooks", () => {
  it("loads rooms, bell schedules, class timetable slots, and teacher load", async () => {
    signInAs(ADMIN);
    const academicYearId = CALENDAR.littleSteps;
    const { result } = renderHook(
      () => ({
        rooms: useRooms(),
        schedules: useBellSchedules(),
        slots: useTimetableSlots(CLASS_GROUP.lsSeedlings),
        load: useTeacherLoad(academicYearId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.rooms.data?.items).toHaveLength(2);
      expect(result.current.schedules.data?.items).toHaveLength(1);
      expect(result.current.slots.data?.items).toHaveLength(3);
      expect(result.current.load.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ academicYearId })]),
      );
    });
  });
});
