import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("ProfileTab", () => {
  it("shows read-only region with data residency note and type defaults", async () => {
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByText("Institution identity")).toBeInTheDocument();
    expect(screen.getByText("Europe (EU)")).toBeInTheDocument();
    expect(
      screen.getByText("Fixed after creation to honour data residency rules."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Terms")).toBeInTheDocument();
    expect(screen.getByText("M01")).toBeInTheDocument();
  });
});
