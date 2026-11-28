import { OUTCOME_FRAMEWORK, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function openOutcomes(tenant: string = TENANT.riverside) {
  return renderApp("/teaching/curriculum", {
    as: persona(tenant, "teacher"),
    modules: MODULES,
  });
}

describe("OutcomesTab (M29)", () => {
  it("renders nested outcome trees using parentId and framework metadata", async () => {
    openOutcomes(TENANT.riverside);

    expect(await screen.findByText("Riverside Standards")).toBeInTheDocument();
    expect(screen.getByText("Standards")).toBeInTheDocument();
    expect(screen.getByText("CASE import")).toBeInTheDocument();
    expect(screen.getByText("Number and algebra.")).toBeInTheDocument();

    const mathDomain = screen.getByText("Number and algebra.").closest("li")!;
    expect(within(mathDomain).getByText("RV.MATH.5.1")).toBeInTheDocument();
    expect(within(mathDomain).getByText("Adds fractions.")).toBeInTheDocument();
    expect(within(mathDomain).getByText("RV.MATH.9.1")).toBeInTheDocument();
  });

  it("switches frameworks and lists CO–PO mappings with correlation strength", async () => {
    openOutcomes(TENANT.northbridge);

    expect(await screen.findByText("Designs modular structured programs.")).toBeInTheDocument();
    expect(await screen.findByText("CO1 → PO1")).toBeInTheDocument();
    expect(screen.getByText("CO1 → PO2")).toBeInTheDocument();
    expect(screen.getAllByText("High (3)").length).toBeGreaterThan(0);
    expect(screen.getByText("Medium (2)")).toBeInTheDocument();
    expect(screen.getByText("Low (1)")).toBeInTheDocument();

    const select = screen.getByLabelText("Outcome framework") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: OUTCOME_FRAMEWORK.nbProgramOutcomes } });

    expect(await screen.findByText("Analyses computing engineering tasks.")).toBeInTheDocument();
    expect(screen.getByText("Program outcomes")).toBeInTheDocument();
    expect(await screen.findByText("CO1 → PO1")).toBeInTheDocument();
  });

  it("shows an empty state when the tenant has no outcome frameworks", async () => {
    mockDb.outcomeFrameworks = mockDb.outcomeFrameworks.filter(
      (row) => row.tenantId !== TENANT.riverside,
    );
    openOutcomes(TENANT.riverside);

    expect(
      await screen.findByRole("heading", { name: "No outcome frameworks yet" }),
    ).toBeInTheDocument();
  });

  it("shows an error state and retries when loading frameworks fails", async () => {
    server.use(
      http.get("*/api/v1/outcome-frameworks", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );
    openOutcomes(TENANT.riverside);

    expect(
      await screen.findByRole("heading", { name: "Outcomes could not be loaded." }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Riverside Standards")).toBeInTheDocument();
  });
});
