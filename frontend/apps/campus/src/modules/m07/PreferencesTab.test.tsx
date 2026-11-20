import { TENANT } from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("PreferencesTab", () => {
  afterEach(() => vi.restoreAllMocks());

  it("disables channels the institution has not set up", async () => {
    renderApp("/notifications", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(await screen.findByRole("switch", { name: "Text message" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Email" })).toBeEnabled();
    expect(screen.getAllByText("Not set up by your institution.").length).toBe(3);
  });

  it("queues one outbox write when saved offline", async () => {
    const who = persona(TENANT.riverside, "guardian");
    const { db } = renderApp("/notifications", { as: who, modules: MODULES });
    const email = await screen.findByRole("switch", { name: "Email" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent.click(email);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Saved on this device/)).toBeInTheDocument();
    await waitFor(async () => {
      const queued = await listOutbox(db, { tenantId: who.tenantId, userId: who.userId });
      expect(queued).toHaveLength(1);
    });
  });
});
