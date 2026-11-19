import { TENANT } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("ComplianceTab", () => {
  it("shows the packs that apply with their rules", async () => {
    renderApp("/privacy", { as: persona(TENANT.northbridge, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Compliance" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText("FERPA (US)")).toBeInTheDocument();
    expect(screen.getByText("COPPA (US)")).toBeInTheDocument();
    expect(screen.getAllByText("Deadline for data requests")).toHaveLength(2);
    expect(screen.getAllByText(/\d+ days/).length).toBeGreaterThan(0);
  });
});
