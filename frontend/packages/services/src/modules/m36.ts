import {
  LiveJoinSchema,
  LiveRecordingSchema,
  LiveSessionSchema,
  LiveSummarySchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const LiveSessionPage = pageSchema(LiveSessionSchema);
const LiveJoinPage = pageSchema(LiveJoinSchema);
const LiveRecordingPage = pageSchema(LiveRecordingSchema);

export function useLiveSessions(courseSpaceId: string | null = null) {
  const query = courseSpaceId === null ? all : { ...all, courseSpaceId };
  return useScopedQuery(
    (s) => queryKeys.m36.liveSessions(s, courseSpaceId),
    (c, signal) => c.get("/live-sessions", LiveSessionPage, query, { signal }),
  );
}

export function useLiveSession(sessionId: string | null) {
  const path = `/live-sessions/${encodeURIComponent(sessionId ?? "")}`;
  return useScopedQuery(
    (s) => queryKeys.m36.liveSession(s, sessionId),
    (c, signal) => c.get(path, LiveSessionSchema, undefined, { signal }),
    sessionId !== null,
  );
}

export function useLiveJoins(sessionId: string | null) {
  const path = `/live-sessions/${encodeURIComponent(sessionId ?? "")}/joins`;
  return useScopedQuery(
    (s) => queryKeys.m36.liveJoins(s, sessionId),
    (c, signal) => c.get(path, LiveJoinPage, all, { signal }),
    sessionId !== null,
  );
}

export function useLiveRecordings(sessionId: string | null) {
  const path = `/live-sessions/${encodeURIComponent(sessionId ?? "")}/recordings`;
  return useScopedQuery(
    (s) => queryKeys.m36.liveRecordings(s, sessionId),
    (c, signal) => c.get(path, LiveRecordingPage, all, { signal }),
    sessionId !== null,
  );
}

export function useLiveSummary(sessionId: string | null) {
  const path = `/live-sessions/${encodeURIComponent(sessionId ?? "")}/summary`;
  return useScopedQuery(
    (s) => queryKeys.m36.liveSummary(s, sessionId),
    (c, signal) => c.get(path, LiveSummarySchema, undefined, { signal }),
    sessionId !== null,
  );
}
