import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("InstallPage (M84)", () => {
  it("shows licence use, the update, backups and the bundle waiting for review", async () => {
    renderApp("/install", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Install & updates" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,284 of 1,500")).toBeInTheDocument();
    expect(await screen.findByText("Version 2.4.2")).toBeInTheDocument();
    expect(screen.getByText("Security fix")).toBeInTheDocument();
    expect(await screen.findAllByText(/Encrypted backup of/)).toHaveLength(2);
    expect(await screen.findByText("Waiting for your review")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is sent until an admin approves it/)).toBeInTheDocument();
  });

  it("is not in the menu of a tenant without an install", async () => {
    renderApp("/install", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    expect(await screen.findByText("Not in your plan")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Install & updates" })).not.toBeInTheDocument();
  });
});
