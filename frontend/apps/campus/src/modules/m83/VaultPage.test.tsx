import { TENANT } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("VaultPage (M83)", () => {
  it("is AI-blocked in the registry and hides the Assist button", async () => {
    expect(MODULES.find((m) => m.moduleId === "M83")?.aiBlocked).toBe(true);
    renderApp("/vault", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Data vault & access" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Nexus Assist" })).not.toBeInTheDocument();
  });

  it("badges the pending request count on the requests tab", async () => {
    renderApp("/vault", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: /Access requests/ });
    expect(await within(tab).findByLabelText("1 request waiting")).toBeInTheDocument();
    for (const name of ["Grants", "Keys", "Emergency access"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("gives a teacher no menu item and no access", async () => {
    renderApp("/vault", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByText("No access")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Data vault & access" })).not.toBeInTheDocument();
  });
});
