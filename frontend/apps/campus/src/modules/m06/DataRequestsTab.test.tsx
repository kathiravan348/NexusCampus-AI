import { DEMO_NOW, TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { DataRequestsTab } from "./DataRequestsTab";

function renderTab(now: Date) {
  localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.apex]: "en-IN" }));
  signInAs(persona(TENANT.apex, "admin"));
  render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <DataRequestsTab canSeeUsers now={now} />
      </MemoryRouter>
    </AppProviders>,
  );
  return screen.findByRole("table", { name: "Data requests" });
}

const auditCount = () => mockDb.auditEvents.filter((e) => e.tenantId === TENANT.apex).length;

describe("DataRequestsTab", () => {
  it("marks an open request past its due date as overdue", async () => {
    const table = await renderTab(new Date(DEMO_NOW));
    const row = (await within(table).findByText("Correction")).closest("tr")!;
    expect(within(row).getByText("Overdue")).toBeInTheDocument();
  });

  it("is not overdue before the due date", async () => {
    const table = await renderTab(new Date("2026-08-15T00:00:00Z"));
    const row = (await within(table).findByText("Correction")).closest("tr")!;
    expect(within(row).queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("starts a request, updating its status and adding an audit row", async () => {
    const table = await renderTab(new Date(DEMO_NOW));
    const before = auditCount();
    const row = (await within(table).findByText("Correction")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button"));
    const dialog = await screen.findByRole("dialog", { name: "Correction" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start work" }));
    expect(await screen.findByText("Request updated.")).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("button", { name: "Mark completed" }),
    ).toBeInTheDocument();
    expect(auditCount()).toBe(before + 1);
  });

  it("shows an error toast when the server refuses the step", async () => {
    const table = await renderTab(new Date(DEMO_NOW));
    const row = (await within(table).findByText("Correction")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button"));
    const dialog = await screen.findByRole("dialog", { name: "Correction" });
    // Someone else closed it meanwhile: the shown step is no longer allowed.
    const dsr = mockDb.dataRequests.find((r) => r.id === "dsr-ax-correct")!;
    Object.assign(dsr, { status: "completed", completedAt: "2026-09-10T00:00:00Z" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start work" }));
    expect(
      await screen.findByText("That step is not allowed for this request."),
    ).toBeInTheDocument();
  });
});
