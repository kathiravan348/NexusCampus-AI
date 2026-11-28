import { TENANT, mockDb, permissionsOf, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useProctoringFlags,
  useProctoringSessions,
  useProctoringSettings,
  useRecordingSegments,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M34 hooks", () => {
  it("loads proctoring settings, sessions, flags and recording metadata", async () => {
    const nbAdmin = mockDb.users.find(
      (row) =>
        row.tenantId === TENANT.northbridge && permissionsOf(row.id).has("m34.proctoring.manage"),
    )!;
    signInAs({ ...ADMIN, tenantId: TENANT.northbridge, userId: nbAdmin.id });
    const { result } = renderHook(
      () => {
        const sessions = useProctoringSessions();
        const first = sessions.data?.items[0];
        const testId = first?.testId ?? null;
        const sessionId = first?.id ?? null;
        return {
          sessions,
          filtered: useProctoringSessions(testId),
          settings: useProctoringSettings(testId),
          flags: useProctoringFlags(sessionId),
          recordings: useRecordingSegments(sessionId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { sessions, filtered, settings, flags, recordings } = result.current;
      expect(sessions.data?.total).toBe(2);
      expect(filtered.data?.items).toEqual(sessions.data?.items);
      expect(settings.data?.recording).toBe("screen_and_camera");
      expect(settings.data?.retentionDays).toBe(90);
      expect(flags.data?.total).toBe(3);
      expect(recordings.data?.total).toBe(2);
      expect(recordings.data?.items[0]?.deleteOn).toBe("2026-12-11");
    });
  });
});
