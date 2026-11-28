import {
  PAGE_SIZE_MAX,
  ProctoringFlagSchema,
  ProctoringSessionSchema,
  ProctoringSettingsSchema,
  RecordingSegmentSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ProctoringSessionPage = pageSchema(ProctoringSessionSchema);
const ProctoringFlagPage = pageSchema(ProctoringFlagSchema);
const RecordingSegmentPage = pageSchema(RecordingSegmentSchema);

export function useProctoringSettings(testId: string | null) {
  const path = `/online-tests/${encodeURIComponent(testId ?? "")}/proctoring`;
  return useScopedQuery(
    (s) => queryKeys.m34.proctoringSettings(s, testId),
    (c, signal) => c.get(path, ProctoringSettingsSchema, undefined, { signal }),
    testId !== null,
  );
}

export function useProctoringSessions(testId: string | null = null) {
  const query = testId === null ? all : { ...all, testId };
  return useScopedQuery(
    (s) => queryKeys.m34.proctoringSessions(s, testId),
    (c, signal) => c.get("/proctoring-sessions", ProctoringSessionPage, query, { signal }),
  );
}

export function useProctoringFlags(sessionId: string | null) {
  const path = `/proctoring-sessions/${encodeURIComponent(sessionId ?? "")}/flags`;
  return useScopedQuery(
    (s) => queryKeys.m34.proctoringFlags(s, sessionId),
    (c, signal) => c.get(path, ProctoringFlagPage, all, { signal }),
    sessionId !== null,
  );
}

export function useRecordingSegments(sessionId: string | null) {
  const path = `/proctoring-sessions/${encodeURIComponent(sessionId ?? "")}/recordings`;
  return useScopedQuery(
    (s) => queryKeys.m34.recordingSegments(s, sessionId),
    (c, signal) => c.get(path, RecordingSegmentPage, all, { signal }),
    sessionId !== null,
  );
}
