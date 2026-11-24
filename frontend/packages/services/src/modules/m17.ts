import {
  AttendanceMarkSchema,
  AttendanceRosterEntrySchema,
  AttendanceSessionSchema,
  LeaveRequestSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type AttendanceMark,
  type AttendanceMarkInput,
  type Page,
} from "@nexus/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "../client";
import { queryKeys, type KeyScope } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const SessionPage = pageSchema(AttendanceSessionSchema);
const AttendanceMarkPage = pageSchema(AttendanceMarkSchema);
const LeaveRequestPage = pageSchema(LeaveRequestSchema);

const RosterPage = pageSchema(AttendanceRosterEntrySchema);

async function collectPages<T>(fetchPage: (page: number) => Promise<Page<T>>) {
  const first = await fetchPage(1);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    items.push(...(await fetchPage(page)).items);
  }
  return { ...first, items };
}

export function useAttendanceSessions(classGroupId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m17.attendanceSessions(s, classGroupId),
    (c, signal) =>
      collectPages((page) =>
        c.get("/attendance-sessions", SessionPage, { ...all, page, classGroupId }, { signal }),
      ),
  );
}

export function useAttendanceMarks(sessionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m17.attendanceMarks(s, sessionId),
    (c, signal) =>
      collectPages((page) =>
        c.get(
          `/attendance-sessions/${encodeURIComponent(sessionId ?? "")}/marks`,
          AttendanceMarkPage,
          { ...all, page },
          { signal },
        ),
      ),
    sessionId !== null,
  );
}

export function useLeaveRequests() {
  return useScopedQuery(queryKeys.m17.leaveRequests, (c, signal) =>
    c.get("/leave-requests", LeaveRequestPage, all, { signal }),
  );
}

export function useAttendanceRoster(sessionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m17.attendanceRoster(s, sessionId),
    (c, signal) =>
      collectPages((page) =>
        c.get(
          `/attendance-sessions/${encodeURIComponent(sessionId ?? "")}/roster`,
          RosterPage,
          { ...all, page },
          { signal },
        ),
      ),
    sessionId !== null,
  );
}

interface MarkWrite extends KeyScope {
  sessionId: string;
  clientId: string;
  input: AttendanceMarkInput;
}

interface LocalMark extends MarkWrite {
  state: "saving" | "queued" | "failed";
}

function pendingKey(scope: KeyScope, sessionId: string | null) {
  return [...queryKeys.m17.attendanceMarks(scope, sessionId), "pending"];
}

export function useSaveAttendanceMark(sessionId: string | null) {
  const { session } = useSession();
  const qc = useQueryClient();
  const pending = useQuery<LocalMark[]>({
    queryKey: session ? pendingKey(session, sessionId) : ["signed-out", "attendance-pending"],
    queryFn: () => [],
    enabled: false,
    gcTime: Infinity,
  });
  const mutation = useOutboxMutation<MarkWrite, AttendanceMark>({
    moduleId: "M17",
    operation: "attendance.mark",
    mergeRule: "append-only",
    priority: "high",
    send: async (client, write, idempotencyKey) => {
      // Replay the session stored with the write, even if another roll call is now open.
      if (!session || session.tenantId !== write.tenantId || session.userId !== write.userId) {
        throw new Error("Attendance account changed");
      }
      const local = pendingKey(write, write.sessionId);
      let mark: AttendanceMark;
      try {
        mark = await client.send(
          "POST",
          `/attendance-sessions/${encodeURIComponent(write.sessionId)}/marks`,
          write.input,
          AttendanceMarkSchema,
          { headers: idempotencyHeaders(idempotencyKey) },
        );
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          qc.setQueryData<LocalMark[]>(local, (rows) =>
            rows?.map((row) =>
              row.clientId === write.clientId ? { ...row, state: "failed" } : row,
            ),
          );
        }
        throw error;
      }
      const key = queryKeys.m17.attendanceMarks(write, write.sessionId);
      if (qc.getQueryData(key)) {
        await qc.cancelQueries({ queryKey: key, exact: true });
        qc.setQueryData<Page<AttendanceMark>>(key, (previous) => {
          if (!previous || previous.items.some((item) => item.id === mark.id)) return previous;
          return { ...previous, items: [...previous.items, mark], total: previous.total + 1 };
        });
      } else {
        await qc.invalidateQueries({ queryKey: key, exact: true });
      }
      qc.setQueryData<LocalMark[]>(local, (rows) =>
        rows?.filter((row) => row.clientId !== write.clientId),
      );
      return mark;
    },
  });
  async function saveMark(input: AttendanceMarkInput) {
    if (!session || !sessionId) throw new Error("Attendance session required");
    const write = {
      tenantId: session.tenantId,
      userId: session.userId,
      sessionId,
      clientId: crypto.randomUUID(),
      input,
    };
    const key = pendingKey(session, sessionId);
    qc.setQueryData<LocalMark[]>(key, (rows) => [
      ...(rows ?? []).filter(
        (row) => row.state !== "failed" || row.input.learnerId !== input.learnerId,
      ),
      { ...write, state: "saving" },
    ]);
    try {
      const result = await mutation.mutateAsync(write);
      if (result.queued) {
        // A fast reconnect may already have replayed and removed this write.
        qc.setQueryData<LocalMark[]>(key, (rows) =>
          rows?.map((row) =>
            row.clientId === write.clientId && row.state === "saving"
              ? { ...row, state: "queued" }
              : row,
          ),
        );
      }
      return result;
    } catch (error) {
      qc.setQueryData<LocalMark[]>(key, (rows) =>
        rows?.filter((row) => row.clientId !== write.clientId),
      );
      throw error;
    }
  }
  const rows = pending.data ?? [];
  return {
    saveMark,
    pendingMarks: rows.filter((row) => row.state === "queued"),
    replayFailed: rows.some((row) => row.state === "failed"),
  };
}
