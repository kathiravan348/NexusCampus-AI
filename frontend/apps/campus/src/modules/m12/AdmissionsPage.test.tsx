import { TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("Admissions (M12)", () => {
  it("opens the three admissions tabs and Assist for an administrator", async () => {
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: "Admissions" })).toBeVisible();
    for (const name of ["Enquiries", "Applications", "Offers & waitlist"]) {
      expect(screen.getByRole("tab", { name })).toBeVisible();
    }
    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeVisible();
  });

  it.each(["teacher", "guardian"])("shows no access for a %s", async (role) => {
    renderApp("/admissions", { as: persona(TENANT.riverside, role), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add enquiry" })).toBeNull();
  });

  it("keeps cached enquiries visible and disables adding offline", async () => {
    const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
      const row = mockDb.enquiries.find((entry) => entry.tenantId === TENANT.riverside)!;
      expect(await screen.findByRole("button", { name: row.learnerName })).toBeVisible();
      const add = screen.getByRole("button", { name: "Add enquiry" });
      expect(add).toBeEnabled();
      connection.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(add).toBeDisabled();
      expect(screen.getByRole("button", { name: row.learnerName })).toBeVisible();
      expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    } finally {
      connection.mockRestore();
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
    }
  });
});
