import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useLearningPaths,
  useMasteryRecords,
  useTutorMessages,
  useTutorSessions,
  useTutorSettings,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M35 hooks", () => {
  it("loads mastery, learning paths, tutor settings, sessions and messages", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const mastery = useMasteryRecords();
        const paths = useLearningPaths();
        const sessions = useTutorSessions();
        const path = paths.data?.items[0];
        const learnerId = path?.learnerId ?? null;
        const courseSpaceId = path?.courseSpaceId ?? null;
        const sessionId = sessions.data?.items[0]?.id ?? null;
        return {
          mastery,
          masteryByLearner: useMasteryRecords(learnerId),
          masteryBySpace: useMasteryRecords(null, courseSpaceId),
          paths,
          pathsByLearner: useLearningPaths(learnerId),
          tutorSettings: useTutorSettings(courseSpaceId),
          sessions,
          sessionsBySpace: useTutorSessions(courseSpaceId),
          messages: useTutorMessages(sessionId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        mastery,
        masteryByLearner,
        masteryBySpace,
        paths,
        pathsByLearner,
        tutorSettings,
        sessions,
        sessionsBySpace,
        messages,
      } = result.current;
      expect(mastery.data?.total).toBe(2);
      expect(masteryByLearner.data?.items).toHaveLength(1);
      expect(masteryByLearner.data?.items[0]?.level).toBe("mastered");
      expect(masteryBySpace.data?.items).toHaveLength(1);
      expect(masteryBySpace.data?.items).toEqual(masteryByLearner.data?.items);
      expect(paths.data?.total).toBe(1);
      expect(pathsByLearner.data?.items).toEqual(paths.data?.items);
      expect(tutorSettings.data?.mode).toBe("hints_only");
      expect(sessions.data?.total).toBe(1);
      expect(sessionsBySpace.data?.items).toEqual(sessions.data?.items);
      expect(messages.data?.total).toBe(2);
    });
  });
});
