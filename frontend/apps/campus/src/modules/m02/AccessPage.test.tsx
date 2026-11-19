import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("AccessPage (M02)", () => {
  it("shows every tab to an admin, with the demo banner", async () => {
    renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Users & access" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    for (const name of ["Users", "Roles", "Sessions", "Single sign-on"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("hides Roles and SSO from a teacher", async () => {
    renderApp("/access", { as: persona(TENANT.littleSteps, "teacher"), modules: MODULES });
    expect(await screen.findByRole("tab", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Roles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Single sign-on" })).not.toBeInTheDocument();
  });
});
