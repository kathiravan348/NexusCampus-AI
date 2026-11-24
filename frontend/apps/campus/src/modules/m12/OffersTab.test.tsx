import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("OffersTab", () => {
  it("shows offers and sorts waitlist places by position", async () => {
    const entry = mockDb.waitlistEntries.find((row) => row.tenantId === TENANT.riverside)!;
    mockDb.waitlistEntries = [
      ...mockDb.waitlistEntries.filter((row) => row.tenantId !== TENANT.riverside),
      { ...entry, position: 2 },
      { ...entry, id: "wait-test-first", position: 1 },
    ];
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Offers & waitlist" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText(/^Expires on /)).toBeVisible();
    expect(screen.getAllByText(/^Position [12]$/).map((item) => item.textContent)).toEqual([
      "Position 1",
      "Position 2",
    ]);
    const offer = mockDb.admissionOffers.find((row) => row.tenantId === TENANT.riverside)!;
    const app = mockDb.applications.find((row) => row.id === offer.applicationId)!;
    expect(screen.getAllByText(app.applicationNumber).length).toBeGreaterThan(0);
  });
});
