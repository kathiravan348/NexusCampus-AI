import { CLASS_GROUP, attendanceSessionId } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { useAttendanceMarks, useAttendanceSessions, useLeaveRequests } from "../index";
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
