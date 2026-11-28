import {
  PAGE_SIZE_MAX,
  ProctoringFlagSchema,
  ProctoringSessionSchema,
  ProctoringSettingsSchema,
  RecordingSegmentSchema,
  pageSchema,
  type FlagReviewInput,
  type IdentityDecisionInput,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { idempotencyHeaders } from "../mutation";
import { useScopedQuery, useServices } from "../query";

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

export function useReviewFlag() {
  const { client, scope } = useServices();
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      flagId,
      sessionId,
      input,
    }: {
      flagId: string;
      sessionId: string;
      input: FlagReviewInput;
    }) => {
      if (!scope) throw new Error("Sign in before writing");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Connect to review");
      }
      const flag = await client.send(
        "PATCH",
        `/proctoring-flags/${encodeURIComponent(flagId)}/review`,
        input,
        ProctoringFlagSchema,
        { headers: idempotencyHeaders(globalThis.crypto.randomUUID()) },
      );
      await qc.invalidateQueries({ queryKey: queryKeys.m34.proctoringFlags(scope, sessionId) });
      return flag;
    },
  });
}

export function useDecideIdentity() {
  const { client, scope } = useServices();
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      sessionId,
      testId,
      input,
    }: {
      sessionId: string;
      testId: string;
      input: IdentityDecisionInput;
    }) => {
      if (!scope) throw new Error("Sign in before writing");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Connect to review");
      }
      const session = await client.send(
        "PATCH",
        `/proctoring-sessions/${encodeURIComponent(sessionId)}/identity`,
        input,
        ProctoringSessionSchema,
        { headers: idempotencyHeaders(globalThis.crypto.randomUUID()) },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.m34.proctoringSessions(scope, testId) }),
        qc.invalidateQueries({ queryKey: queryKeys.m34.proctoringSessions(scope, null) }),
      ]);
      return session;
    },
  });
}
