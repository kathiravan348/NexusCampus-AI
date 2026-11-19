import { TENANT } from "@nexus/mocks";
import { enqueueWrite, type NexusOfflineDB, type OutboxTransport } from "@nexus/offline";
import { createNexusQueryClient } from "@nexus/services";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ThisDeviceTab } from "./ThisDeviceTab";

const ADMIN = persona(TENANT.littleSteps, "admin");
const scope = { tenantId: ADMIN.tenantId, userId: ADMIN.userId };

function renderTab(db: NexusOfflineDB, transport: OutboxTransport) {
  signInAs(ADMIN);
  render(
    <AppProviders
      db={db}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ThisDeviceTab transport={transport} />
      </MemoryRouter>
    </AppProviders>,
  );
}

const queue = (db: NexusOfflineDB) =>
  act(() =>
    enqueueWrite(db, scope, {
      moduleId: "M02",
      operation: "person.update",
      mergeRule: "manual-review-only",
      payload: { phone: "+910000000000" },
    }),
  );

describe("ThisDeviceTab", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows queued writes live (never the payload) and sends them with Sync now", async () => {
    const db = freshDb();
    const transport = vi.fn<OutboxTransport>(async () => ({ kind: "ok" }));
    renderTab(db, transport);
    expect(await screen.findByText("Everything on this device is sent.")).toBeInTheDocument();

    await queue(db);
    const list = await screen.findByRole("list", { name: "Waiting to send" });
    expect(within(list).getByText("M02 · person.update")).toBeInTheDocument();
    expect(screen.queryByText(/\+910000000000/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(await screen.findByText("1 change sent.")).toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Everything on this device is sent.")).toBeInTheDocument();
  });

  it("lets the user keep the server's version of a conflicting write", async () => {
    const db = freshDb();
    renderTab(db, async () => ({ kind: "conflict", message: "conflict" }));
    await queue(db);
    await screen.findByText("M02 · person.update");
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep the server's" }));
    expect(await screen.findByText("Everything on this device is sent.")).toBeInTheDocument();
  });

  it("works offline: queued writes stay listed and Sync now waits for a connection", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();
    renderTab(db, async () => ({ kind: "ok" }));
    await queue(db);
    expect(await screen.findByText("M02 · person.update")).toBeInTheDocument();
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled());
  });
});
