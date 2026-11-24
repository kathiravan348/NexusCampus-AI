import { CLASS_GROUP, attendanceSessionId, mockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useAttendanceMarks,
  useAttendanceRoster,
  useAttendanceSessions,
  useLeaveRequests,
  useSaveAttendanceMark,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M17 hooks", () => {
  it("loads class attendance sessions, marks, and leave requests", async () => {
    signInAs(ADMIN);
    const sessionId = attendanceSessionId("ls", 2);
    const { result } = renderHook(
      () => ({
        sessions: useAttendanceSessions(CLASS_GROUP.lsSeedlings),
        marks: useAttendanceMarks(sessionId),
        leave: useLeaveRequests(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.sessions.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: sessionId })]),
      );
      const marks = result.current.marks.data?.items;
      expect(marks).toHaveLength(2);
      expect(marks?.every((row) => row.sessionId === sessionId)).toBe(true);
      expect(result.current.leave.data?.items).toHaveLength(2);
    });
  });
});

it("replays a queued correction once into its original session after switching sessions", async () => {
  signInAs(ADMIN);
  const id = attendanceSessionId("ls", 2);
  const session = mockDb.attendanceSessions.find((row) => row.id === id)!;
  session.status = "open";
  session.submittedAt = null;
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  try {
    const { result, rerender } = renderHook(
      ({ selected }) => ({
        roster: useAttendanceRoster(id),
        marks: useAttendanceMarks(id),
        write: useSaveAttendanceMark(selected),
      }),
      { initialProps: { selected: id }, wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.roster.data?.items.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.marks.isSuccess).toBe(true));
    const count = result.current.marks.data!.total;
    const input = {
      learnerId: result.current.roster.data!.items[0]!.learnerId,
      status: "late" as const,
      minutesLate: 10,
      note: null,
    };
    online.mockReturnValue(false);
    await act(async () => {
      expect((await result.current.write.saveMark(input)).queued).toBe(true);
    });
    await waitFor(() => expect(result.current.write.pendingMarks).toHaveLength(1));
    expect(result.current.marks.data?.total).toBe(count);
    rerender({ selected: attendanceSessionId("ls", 1) });
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.marks.data?.total).toBe(count + 1));
    expect(result.current.marks.data?.items.at(-1)).toMatchObject({ ...input, sessionId: id });
    expect(mockDb.attendanceMarks.filter((row) => row.sessionId === id)).toHaveLength(count + 1);
    rerender({ selected: id });
    await waitFor(() => expect(result.current.write.pendingMarks).toHaveLength(0));
  } finally {
    online.mockRestore();
  }
});
