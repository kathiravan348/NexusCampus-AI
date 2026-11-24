import {
  AttendanceMarkSchema,
  AttendanceSessionSchema,
  LeaveRequestSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const SessionPage = pageSchema(AttendanceSessionSchema);
const AttendanceMarkPage = pageSchema(AttendanceMarkSchema);
const LeaveRequestPage = pageSchema(LeaveRequestSchema);

export function useAttendanceSessions(classGroupId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m17.attendanceSessions(s, classGroupId),
    (c, signal) => c.get("/attendance-sessions", SessionPage, { ...all, classGroupId }, { signal }),
  );
}

export function useAttendanceMarks(sessionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m17.attendanceMarks(s, sessionId),
    (c, signal) =>
      c.get(
        `/attendance-sessions/${encodeURIComponent(sessionId ?? "")}/marks`,
        AttendanceMarkPage,
        all,
        { signal },
      ),
    sessionId !== null,
  );
}

export function useLeaveRequests() {
  return useScopedQuery(queryKeys.m17.leaveRequests, (c, signal) =>
    c.get("/leave-requests", LeaveRequestPage, all, { signal }),
  );
}
