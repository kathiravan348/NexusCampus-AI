import { CLASS_SESSION, LEARNER, TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useCatalogueCourses,
  useClassSessions,
  useLevelExams,
  usePackPurchases,
  usePracticeFeedback,
  useSessionBookings,
  useSessionPacks,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M41 hooks", () => {
  it("loads courses, packs, sessions, bookings, exams and practice feedback", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.harmony, userId: USER.hmWeiLing });
    const { result } = renderHook(
      () => ({
        courses: useCatalogueCourses(),
        packs: useSessionPacks(),
        purchases: usePackPurchases(),
        purchasesByLearner: usePackPurchases(LEARNER.hmChloe),
        sessions: useClassSessions(),
        sessionsInRange: useClassSessions("2026-11-22", "2026-11-27"),
        bookings: useSessionBookings(),
        bookingsBySession: useSessionBookings(CLASS_SESSION.hmTrial),
        exams: useLevelExams(),
        examsByLearner: useLevelExams(LEARNER.hmRachel),
        feedback: usePracticeFeedback(),
        feedbackByLearner: usePracticeFeedback(LEARNER.hmMarcus),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        courses,
        packs,
        purchases,
        purchasesByLearner,
        sessions,
        sessionsInRange,
        bookings,
        bookingsBySession,
        exams,
        examsByLearner,
        feedback,
        feedbackByLearner,
      } = result.current;
      expect(courses.data?.total).toBe(3);
      expect(packs.data?.total).toBe(2);
      expect(purchases.data?.total).toBe(4);
      expect(purchasesByLearner.data?.items).toHaveLength(1);
      expect(sessions.data?.total).toBe(6);
      expect(sessionsInRange.data?.items).toHaveLength(3);
      expect(bookings.data?.total).toBe(6);
      expect(bookingsBySession.data?.items).toHaveLength(1);
      expect(exams.data?.total).toBe(5);
      expect(examsByLearner.data?.items).toHaveLength(3);
      expect(feedback.data?.total).toBe(2);
      expect(feedbackByLearner.data?.items).toHaveLength(1);
    });
  });
});
