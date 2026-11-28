import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useLiveJoins,
  useLiveRecordings,
  useLiveSession,
  useLiveSessions,
  useLiveSummary,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M36 hooks", () => {
  it("loads live sessions, joins, recordings and summary", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const sessions = useLiveSessions();
        const mathSession = sessions.data?.items.find(
          (row) => row.title.includes("Fractions") && row.status === "ended",
        );
        const sessionId = mathSession?.id ?? null;
        const courseSpaceId = mathSession?.courseSpaceId ?? null;
        return {
          sessions,
          sessionsBySpace: useLiveSessions(courseSpaceId),
          session: useLiveSession(sessionId),
          joins: useLiveJoins(sessionId),
          recordings: useLiveRecordings(sessionId),
          summary: useLiveSummary(sessionId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { sessions, sessionsBySpace, session, joins, recordings, summary } = result.current;
      expect(sessions.data?.total).toBe(4);
      expect(sessionsBySpace.data?.total).toBe(2);
      expect(session.data?.status).toBe("ended");
      expect(joins.data?.total).toBe(2);
      expect(recordings.data?.total).toBe(1);
      expect(recordings.data?.items[0]?.status).toBe("ready");
      expect(summary.data?.aiGenerated).toBe(true);
      expect(summary.data?.status).toBe("published");
    });
  });
});
