import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function runCheck() {
  renderApp("/privacy", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  const table = await screen.findByRole("table", { name: "Audit events" });
  await within(table).findAllByRole("button");
  fireEvent.click(screen.getByRole("button", { name: "Check this page" }));
}

describe("ChainCheck", () => {
  it("reports the fixture chain as intact", async () => {
    await runCheck();
    expect(await screen.findByText(/linked and intact/, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("reports the row where a tampered hash breaks the chain", async () => {
    const events = mockDb.auditEvents.filter((e) => e.tenantId === TENANT.littleSteps);
    events[2]!.hash = "0".repeat(64);
    await runCheck();
    expect(
      await screen.findByText("Page check: the chain is broken at row 4."),
    ).toBeInTheDocument();
  });

  it("is disabled while filters are on", async () => {
    renderApp("/privacy", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    await screen.findByRole("table", { name: "Audit events" });
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "m02.user.invited" } });
    expect(screen.getByRole("button", { name: "Check this page" })).toBeDisabled();
    expect(screen.getByText("Clear the filters to check the chain.")).toBeInTheDocument();
  });
});
