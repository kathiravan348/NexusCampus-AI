import { CALENDAR, CLASS_GROUP, OFFERING, ROOM, resetMockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useBellSchedules,
  useCreateTimetableSlot,
  useRooms,
  useTeacherLoad,
  useTimetableSlots,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

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

  it("creates a timetable slot and invalidates M16 queries", async () => {
    signInAs(ADMIN);
    const academicYearId = CALENDAR.littleSteps;
    const { result } = renderHook(
      () => ({
        slots: useTimetableSlots(CLASS_GROUP.lsSeedlings),
        load: useTeacherLoad(academicYearId),
        create: useCreateTimetableSlot(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.slots.data?.items).toHaveLength(3);
      expect(result.current.load.data?.items.length).toBeGreaterThan(0);
    });
    const firstLoad = result.current.load.data!.items[0]!;
    const beforePeriods = firstLoad.weeklyPeriods;

    await act(async () => {
      await result.current.create.mutateAsync({
        academicYearId,
        periodId: null,
        subjectOfferingId: OFFERING.lsSeedlings[0],
        weekday: 4,
        start: "11:10",
        end: "12:00",
        roomId: ROOM.ls[0],
        staffProfileIds: [firstLoad.staffProfileId],
        effectiveFrom: "2026-06-01",
        effectiveTo: null,
      });
    });

    await waitFor(() => {
      expect(result.current.slots.data?.items).toHaveLength(4);
      const updated = result.current.load.data?.items.find(
        (row) => row.staffProfileId === firstLoad.staffProfileId,
      );
      expect(updated?.weeklyPeriods).toBe(beforePeriods + 1);
    });
  });
});
