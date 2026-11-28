import { TENANT, mockDb, permissionsOf, resetMockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useProctoringFlags,
  useProctoringSessions,
  useProctoringSettings,
  useRecordingSegments,
  useReviewFlag,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

const tenantId = TENANT.northbridge;

function signInManager() {
  const admin = mockDb.users.find(
    (row) => row.tenantId === tenantId && permissionsOf(row.id).has("m34.proctoring.manage"),
  )!;
  const staff = mockDb.roleProfiles.find(
    (row) => row.tenantId === tenantId && row.kind === "staff" && row.status === "active",
  )!;
  admin.personId = staff.personId;
  signInAs({ ...ADMIN, tenantId, userId: admin.id });
}

describe("M34 hooks", () => {
  it("loads proctoring settings, sessions, flags and recording metadata", async () => {
    signInManager();
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

  it("refreshes the flag list after a review", async () => {
    signInManager();
    const flag = mockDb.proctoringFlags.find(
      (row) => row.tenantId === tenantId && row.review === "pending",
    )!;
    const { id: flagId, sessionId } = flag;
    const { result } = renderHook(
      () => ({ flags: useProctoringFlags(sessionId), review: useReviewFlag() }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    const cachedFlag = () => result.current.flags.data?.items.find((row) => row.id === flagId);
    await waitFor(() => expect(cachedFlag()?.review).toBe("pending"));

    await act(async () => {
      await result.current.review.mutateAsync({
        flagId,
        sessionId,
        input: { review: "dismissed", note: null },
      });
    });
    await waitFor(() => expect(cachedFlag()?.review).toBe("dismissed"));
  });

  it("rejects flag reviews offline without sending a request", async () => {
    signInManager();
    const { result } = renderHook(useReviewFlag, { wrapper: wrapper({ db: freshDb() }) });
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await act(async () => {
        await expect(
          result.current.mutateAsync({
            flagId: "flag-offline",
            sessionId: "session-offline",
            input: { review: "dismissed", note: null },
          }),
        ).rejects.toThrow("Connect to review");
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      online.mockRestore();
    }
  });
});
