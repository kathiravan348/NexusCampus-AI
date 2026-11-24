import { TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { PlansTab } from "./PlansTab";

function renderPlans() {
  signInAs(persona(TENANT.riverside, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlansTab />
    </AppProviders>,
  );
}

describe("PlansTab (M18)", () => {
  it("shows fee heads, plans, concessions and refunds without exposing reason text", async () => {
    const concession = mockDb.concessions.find((row) => row.tenantId === TENANT.riverside)!;
    const refund = mockDb.feeRefunds.find((row) => row.tenantId === TENANT.riverside)!;

    renderPlans();

    expect(await screen.findByText("Annual Standard Fee Plan")).toBeInTheDocument();
    expect(screen.getAllByText("Tuition fee").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Activity and lab fee").length).toBeGreaterThan(0);
    expect(screen.getByText("INST1")).toBeInTheDocument();
    expect(screen.getByText("INST2")).toBeInTheDocument();
    expect(screen.getAllByText("50%")).toHaveLength(2);

    expect(screen.getByText("Sibling")).toBeInTheDocument();
    expect(screen.getByText("Percentage")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();

    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("£200.00")).toBeInTheDocument();

    expect(screen.queryByText(concession.reason)).not.toBeInTheDocument();
    expect(screen.queryByText(refund.reason)).not.toBeInTheDocument();
  });
});
