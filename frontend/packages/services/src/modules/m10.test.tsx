import { enqueueWrite, type OutboxTransport } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useDevices,
  useLocalOutbox,
  useResolveConflict,
  useRevokeDevice,
  useSyncConflicts,
  useSyncNow,
} from "./m10";

startMockServer();

describe("m10 hooks", () => {
  it("revokes a device and resolves a conflict, refetching both lists", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        devices: useDevices(),
        conflicts: useSyncConflicts(),
        revoke: useRevokeDevice(),
        resolve: useResolveConflict(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.devices.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.conflicts.isSuccess).toBe(true));
    const device = result.current.devices.data!.items.find((d) => d.status === "active")!;
    await act(() => result.current.revoke.mutateAsync(device.id));
    await waitFor(() =>
      expect(result.current.devices.data!.items.find((d) => d.id === device.id)!.status).toBe(
        "revoke_pending",
      ),
    );
    const open = result.current.conflicts.data!.items.find((c) => c.status === "open")!;
    await act(() => result.current.resolve.mutateAsync({ id: open.id, resolution: "keep_server" }));
    await waitFor(() =>
      expect(result.current.conflicts.data!.items.find((c) => c.id === open.id)!.status).toBe(
        "resolved",
      ),
    );
  });

  it("lists the local outbox live and flushes it with a given transport", async () => {
    signInAs(ADMIN);
    const db = freshDb();
    const sent: string[] = [];
    const transport: OutboxTransport = async (entry) => {
      sent.push(entry.operation);
      return { kind: "ok" };
    };
    const { result } = renderHook(
      () => ({ outbox: useLocalOutbox(), sync: useSyncNow(transport) }),
      {
        wrapper: wrapper({ db }),
      },
    );
    await waitFor(() => expect(result.current.outbox.loading).toBe(false));
    expect(result.current.outbox.entries).toHaveLength(0);

    const scope = { tenantId: ADMIN.tenantId, userId: ADMIN.userId };
    await act(() =>
      enqueueWrite(db, scope, {
        moduleId: "M02",
        operation: "person.update",
        mergeRule: "lww-audited",
        payload: { secret: "never shown" },
      }),
    );
    await waitFor(() => expect(result.current.outbox.entries).toHaveLength(1));

    const summary = await act(() => result.current.sync());
    expect(summary?.sent).toBe(1);
    expect(sent).toEqual(["person.update"]);
    await waitFor(() => expect(result.current.outbox.entries).toHaveLength(0));
  });
});
