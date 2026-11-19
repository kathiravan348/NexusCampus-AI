import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("PrivacyPage (M06)", () => {
  it("shows the four sections to an admin with the demo banner", async () => {
    renderApp("/privacy", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Audit & privacy" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    for (const name of ["Audit log", "Consents", "Data requests", "Compliance"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("is not open to a guardian (no audit permission)", async () => {
    renderApp("/privacy", { as: persona(TENANT.littleSteps, "guardian"), modules: MODULES });
    expect(await screen.findByText("No access")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Audit & privacy" })).not.toBeInTheDocument();
  });
});
