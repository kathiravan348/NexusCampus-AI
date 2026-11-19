import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createOfflineDb, type NexusOfflineDB } from "./db";
import { enqueueWrite, flushOutbox, resolveConflict } from "./outbox";
import { useSyncStatus } from "./useSyncStatus";

const dbs: NexusOfflineDB[] = [];
function openDb(): NexusOfflineDB {
  const db = createOfflineDb(`nexus-status-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

afterEach(async () => {
  setNavigatorOnline(true);
  while (dbs.length > 0) {
    const db = dbs.pop()!;
    await db.delete();
  }
});

describe("useSyncStatus", () => {
  const scope = { tenantId: "t-1", userId: "u-1" };

  it("reacts to enqueue, conflict, flush, and browser online/offline transitions", async () => {
    setNavigatorOnline(true);
    const db = openDb();
    const { result } = renderHook(() => useSyncStatus(db, scope));

    await waitFor(() => {
      expect(result.current.state).toBe("synced");
    });

    const entry = await act(async () =>
      enqueueWrite(db, scope, {
        moduleId: "M17",
        operation: "attendance.mark",
        mergeRule: "lww-audited",
        payload: { present: true },
      }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe("pending");
      expect(result.current.pendingCount).toBe(1);
    });

    // Offline event overrides state while preserving pending count
    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => {
      expect(result.current.state).toBe("offline");
      expect(result.current.online).toBe(false);
      expect(result.current.pendingCount).toBe(1);
    });

    // Back online -> conflict -> resolve -> flush -> synced
    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.state).toBe("pending"));

    await act(async () => {
      await flushOutbox(db, scope, async () => ({
        kind: "conflict",
        message: "Server newer",
      }));
    });
    await waitFor(() => {
      expect(result.current.state).toBe("conflict");
      expect(result.current.conflictCount).toBe(1);
    });

    await act(async () => {
      await resolveConflict(db, scope, entry.id, "retry-local");
      await flushOutbox(db, scope, async () => ({ kind: "ok" }));
    });
    await waitFor(() => {
      expect(result.current.state).toBe("synced");
      expect(result.current.pendingCount).toBe(0);
      expect(result.current.conflictCount).toBe(0);
      expect(result.current.lastSyncedAt).not.toBeNull();
    });
  });

  it("handles null scope gracefully", async () => {
    setNavigatorOnline(true);
    const db = openDb();
    const { result } = renderHook(() => useSyncStatus(db, null));
    await waitFor(() => {
      expect(result.current).toEqual({
        state: "synced",
        online: true,
        pendingCount: 0,
        conflictCount: 0,
        failedCount: 0,
        lastSyncedAt: null,
      });
    });
  });
});
