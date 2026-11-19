import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("SessionsTab", () => {
  it("lists active sessions and removes one when it is revoked", async () => {
    renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Sessions" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const table = await screen.findByRole("table", { name: "Active sessions" });
    expect(await within(table).findByText("Office PC · Chrome")).toBeInTheDocument();
    fireEvent.click(
      within(table).getByRole("button", { name: "End the session on Office PC · Chrome" }),
    );
    expect(await screen.findByText("Session ended.")).toBeInTheDocument();
    expect((await screen.findAllByText("No active sessions.")).length).toBeGreaterThan(0);
  });
});
