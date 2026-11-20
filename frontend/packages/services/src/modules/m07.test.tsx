import { DEMO_PERSONAS, TENANT } from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useDeliveries,
  usePreferences,
  useSavePreferences,
  useSaveTemplate,
  useTemplates,
} from "./m07";

startMockServer();

const AX = (role: string) =>
  DEMO_PERSONAS.find((p) => p.tenantId === TENANT.apex && p.labelKey === `m02.persona.${role}`)!;

describe("m07 hooks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists templates, saves one, and filters deliveries", async () => {
    signInAs(AX("admin"));
    const { result } = renderHook(
      () => ({
        t: useTemplates(),
        save: useSaveTemplate(),
        d: useDeliveries(1, 25, { status: "failed" }),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() =>
      expect(result.current.t.isSuccess && result.current.d.isSuccess).toBe(true),
    );
    expect(result.current.d.data!.items.every((x) => x.status === "failed")).toBe(true);
    const tpl = result.current.t.data!.items.find((x) => x.channel === "in_app")!;
    const saved = await act(() =>
      result.current.save.mutateAsync({
        id: tpl.id,
        data: { subject: null, body: "Hi {name}", enabled: true },
      }),
    );
    expect(saved.version).toBe(tpl.version + 1);
  });

  it("queues one outbox write for a preference change made offline", async () => {
    const who = AX("guardian");
    signInAs(who);
    const db = freshDb();
    const { result } = renderHook(() => ({ p: usePreferences(), save: useSavePreferences() }), {
      wrapper: wrapper({ db }),
    });
    await waitFor(() => expect(result.current.p.isSuccess).toBe(true));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const res = await act(() =>
      result.current.save.mutateAsync({
        channels: [{ channel: "email", enabled: false }],
        quietHours: null,
      }),
    );
    expect(res.queued).toBe(true);
    const queued = await listOutbox(db, { tenantId: who.tenantId, userId: who.userId });
    expect(queued).toHaveLength(1);
    expect(queued[0]!.operation).toBe("preferences.save");
  });
});
