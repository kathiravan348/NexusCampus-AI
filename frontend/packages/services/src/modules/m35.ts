import {
  LearningPathSchema,
  MasteryRecordSchema,
  PAGE_SIZE_MAX,
  TutorMessageSchema,
  TutorSessionSchema,
  TutorSettingsSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const MasteryRecordPage = pageSchema(MasteryRecordSchema);
const LearningPathPage = pageSchema(LearningPathSchema);
const TutorSessionPage = pageSchema(TutorSessionSchema);
const TutorMessagePage = pageSchema(TutorMessageSchema);

export function useMasteryRecords(
  learnerId: string | null = null,
  courseSpaceId: string | null = null,
) {
  const query = {
    ...all,
    ...(learnerId === null ? {} : { learnerId }),
    ...(courseSpaceId === null ? {} : { courseSpaceId }),
  };
  return useScopedQuery(
    (s) => queryKeys.m35.masteryRecords(s, learnerId, courseSpaceId),
    (c, signal) => c.get("/mastery", MasteryRecordPage, query, { signal }),
  );
}

export function useLearningPaths(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m35.learningPaths(s, learnerId),
    (c, signal) => c.get("/learning-paths", LearningPathPage, query, { signal }),
  );
}

export function useTutorSettings(courseSpaceId: string | null) {
  const path = `/course-spaces/${encodeURIComponent(courseSpaceId ?? "")}/tutor`;
  return useScopedQuery(
    (s) => queryKeys.m35.tutorSettings(s, courseSpaceId),
    (c, signal) => c.get(path, TutorSettingsSchema, undefined, { signal }),
    courseSpaceId !== null,
  );
}

export function useTutorSessions(courseSpaceId: string | null = null) {
  const query = courseSpaceId === null ? all : { ...all, courseSpaceId };
  return useScopedQuery(
    (s) => queryKeys.m35.tutorSessions(s, courseSpaceId),
    (c, signal) => c.get("/tutor-sessions", TutorSessionPage, query, { signal }),
  );
}

export function useTutorMessages(sessionId: string | null) {
  const path = `/tutor-sessions/${encodeURIComponent(sessionId ?? "")}/messages`;
  return useScopedQuery(
    (s) => queryKeys.m35.tutorMessages(s, sessionId),
    (c, signal) => c.get(path, TutorMessagePage, all, { signal }),
    sessionId !== null,
  );
}
