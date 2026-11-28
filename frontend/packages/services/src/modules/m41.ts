import {
  CatalogueCourseSchema,
  ClassSessionSchema,
  LevelExamSchema,
  PAGE_SIZE_MAX,
  PackPurchaseSchema,
  PracticeFeedbackSchema,
  SessionBookingSchema,
  SessionPackSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const CatalogueCoursePage = pageSchema(CatalogueCourseSchema);
const SessionPackPage = pageSchema(SessionPackSchema);
const PackPurchasePage = pageSchema(PackPurchaseSchema);
const ClassSessionPage = pageSchema(ClassSessionSchema);
const SessionBookingPage = pageSchema(SessionBookingSchema);
const LevelExamPage = pageSchema(LevelExamSchema);
const PracticeFeedbackPage = pageSchema(PracticeFeedbackSchema);

export function useCatalogueCourses() {
  return useScopedQuery(
    (s) => queryKeys.m41.catalogueCourses(s),
    (c, signal) => c.get("/catalogue-courses", CatalogueCoursePage, all, { signal }),
  );
}

export function useSessionPacks() {
  return useScopedQuery(
    (s) => queryKeys.m41.sessionPacks(s),
    (c, signal) => c.get("/session-packs", SessionPackPage, all, { signal }),
  );
}

export function usePackPurchases(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m41.packPurchases(s, learnerId),
    (c, signal) => c.get("/pack-purchases", PackPurchasePage, query, { signal }),
  );
}

export function useClassSessions(from: string | null = null, to: string | null = null) {
  const query = {
    ...all,
    ...(from !== null ? { from } : {}),
    ...(to !== null ? { to } : {}),
  };
  return useScopedQuery(
    (s) => queryKeys.m41.classSessions(s, from, to),
    (c, signal) => c.get("/class-sessions", ClassSessionPage, query, { signal }),
  );
}

export function useSessionBookings(sessionId: string | null = null) {
  const query = sessionId === null ? all : { ...all, sessionId };
  return useScopedQuery(
    (s) => queryKeys.m41.sessionBookings(s, sessionId),
    (c, signal) => c.get("/session-bookings", SessionBookingPage, query, { signal }),
  );
}

export function useLevelExams(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m41.levelExams(s, learnerId),
    (c, signal) => c.get("/level-exams", LevelExamPage, query, { signal }),
  );
}

export function usePracticeFeedback(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m41.practiceFeedback(s, learnerId),
    (c, signal) => c.get("/practice-feedback", PracticeFeedbackPage, query, { signal }),
  );
}
