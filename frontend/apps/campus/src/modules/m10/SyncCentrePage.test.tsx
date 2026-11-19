import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("SyncCentrePage (M10)", () => {
  it("shows all three tabs to an admin, with the demo banner", async () => {
    renderApp("/sync", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sync centre" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    for (const name of ["This device", "Devices", "Conflicts"]) {
      expect(await screen.findByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("shows only This device to a guardian", async () => {
    renderApp("/sync", { as: persona(TENANT.littleSteps, "guardian"), modules: MODULES });
    expect(await screen.findByRole("tab", { name: "This device" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Devices" })).not.toBeInTheDocument();
  });
});
