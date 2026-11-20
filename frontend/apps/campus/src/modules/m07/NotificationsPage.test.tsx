import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("NotificationsPage (M07)", () => {
  it("shows templates, log and preferences to an admin, with the demo banner", async () => {
    renderApp("/notifications", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    for (const name of ["Templates", "Delivery log", "My preferences"]) {
      expect(await screen.findByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("shows only preferences to a guardian", async () => {
    renderApp("/notifications", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(await screen.findByRole("tab", { name: "My preferences" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Templates" })).not.toBeInTheDocument();
  });
});
