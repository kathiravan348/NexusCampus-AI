import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("ApplicationsTab", () => {
  it("lists application numbers and programs", async () => {
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Applications" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const application = mockDb.applications.find((row) => row.tenantId === TENANT.riverside)!;
    expect(
      await screen.findByRole("heading", { name: application.applicationNumber }),
    ).toBeVisible();
    const program = mockDb.programs.find((row) => row.id === application.programId)!;
    expect((await screen.findAllByText(program.name)).length).toBeGreaterThan(0);
  });

  it("shows an empty state", async () => {
    mockDb.applications = mockDb.applications.filter((row) => row.tenantId !== TENANT.riverside);
    renderApp("/admissions", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Applications" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByRole("heading", { name: "No applications yet" })).toBeVisible();
  });
});
