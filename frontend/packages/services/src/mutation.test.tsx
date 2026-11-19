import { listOutbox } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { z } from "zod";
import { idempotencyHeaders, useOutboxMutation, type OutboxSend } from "./mutation";
import { useSession } from "./session";
import { ADMIN, freshDb, server, signInAs, startMockServer, wrapper } from "./test-utils";

startMockServer();

const scope = { tenantId: ADMIN.tenantId, userId: ADMIN.userId };
const Saved = z.strictObject({ saved: z.literal(true) });
const send: OutboxSend<{ note: string }, z.infer<typeof Saved>> = (client, vars, key) =>
  client.send("POST", "/test-writes", vars, Saved, { headers: idempotencyHeaders(key) });

/** Records every write the server receives. */
function writeEndpoint(answer: () => Response = () => HttpResponse.json({ saved: true })) {
  const calls: { key: string | null; body: unknown }[] = [];
  server.use(
    http.post("*/api/v1/test-writes", async ({ request }) => {
      calls.push({ key: request.headers.get("Idempotency-Key"), body: await request.json() });
      return answer();
    }),
  );
  return calls;
}

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(online);
}

function setup() {
  signInAs(ADMIN);
  const db = freshDb();
  const hook = renderHook(
    () => ({
      mutation: useOutboxMutation({
        moduleId: "M04",
        operation: "test.save",
        mergeRule: "lww-audited",
        priority: "high",
        send,
      }),
      session: useSession(),
    }),
    { wrapper: wrapper({ db }) },
  );
  return { db, ...hook };
}

afterEach(() => vi.restoreAllMocks());

describe("useOutboxMutation", () => {
  it("sends straight away when online, with an idempotency key", async () => {
    const calls = writeEndpoint();
    const { result, db } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutation.mutateAsync({ note: "a" });
    });
    expect(outcome).toEqual({ queued: false, data: { saved: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.key).toMatch(/[0-9a-f-]{36}/);
    expect(await listOutbox(db, scope)).toHaveLength(0);
  });

  it("queues offline, blocks sign-out, and replays once on `online`", async () => {
    const calls = writeEndpoint();
    setOnline(false);
    const { result, db } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutation.mutateAsync({ note: "offline" });
    });
    expect(outcome).toMatchObject({ queued: true });
    const queued = await listOutbox(db, scope);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      moduleId: "M04",
      priority: "high",
      payload: { note: "offline" },
    });
    expect(calls).toHaveLength(0);

    let signOut: unknown;
    await act(async () => {
      signOut = await result.current.session.signOut();
    });
    expect(signOut).toEqual({ blocked: true, pending: 1 });

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    expect(calls).toEqual([{ key: queued[0]?.idempotencyKey, body: { note: "offline" } }]);
  });

  it("queues when the network fails mid-send", async () => {
    const calls = writeEndpoint(() => HttpResponse.error());
    const { result, db } = setup();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutation.mutateAsync({ note: "lost" });
    });
    expect(outcome).toMatchObject({ queued: true });
    const queued = await listOutbox(db, scope);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.idempotencyKey).toBe(calls[0]?.key);
  });

  it("rejects a server error instead of queueing it", async () => {
    writeEndpoint(() =>
      HttpResponse.json({ error: { code: "forbidden", message: "No" } }, { status: 403 }),
    );
    const { result, db } = setup();
    await act(async () => {
      await expect(result.current.mutation.mutateAsync({ note: "x" })).rejects.toMatchObject({
        status: 403,
      });
    });
    expect(await listOutbox(db, scope)).toHaveLength(0);
  });

  it("marks a replay conflict for review", async () => {
    setOnline(false);
    const { result, db } = setup();
    await act(async () => {
      await result.current.mutation.mutateAsync({ note: "clash" });
    });
    writeEndpoint(() =>
      HttpResponse.json({ error: { code: "conflict", message: "Changed" } }, { status: 409 }),
    );
    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(async () =>
      expect(await listOutbox(db, scope, { status: "conflict" })).toHaveLength(1),
    );
  });
});
