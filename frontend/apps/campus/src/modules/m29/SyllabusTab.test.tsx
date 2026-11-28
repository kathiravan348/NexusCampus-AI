import { OFFERING, TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openSyllabusTab(tenant: string = TENANT.riverside) {
  renderApp("/teaching/curriculum", { as: persona(tenant, "teacher"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Syllabus & coverage" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("SyllabusTab (M29)", () => {
  it("shows ordered units, topic coverage with icons and a one-decimal meter", async () => {
    await openSyllabusTab(TENANT.riverside);

    const offeringSelect = (await screen.findByLabelText("Subject offering")) as HTMLSelectElement;
    fireEvent.change(offeringSelect, { target: { value: OFFERING.rvSouthYearFive[1] } });

    expect(await screen.findByText("Fractions")).toBeInTheDocument();
    expect(screen.getByText("MATH-Y5-U1")).toBeInTheDocument();
    expect(screen.getByText("10 hrs")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "50.0% (1 of 2)");

    const coveredBadge = screen.getByText("Covered").closest("span")!;
    expect(coveredBadge.parentElement?.querySelector("svg")).toBeInTheDocument();
    const inProgressBadge = screen.getByText("In progress").closest("span")!;
    expect(inProgressBadge.parentElement?.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Equivalent fractions on a fraction wall")).toBeInTheDocument();
    expect(screen.getByText("Adding fractions with related denominators")).toBeInTheDocument();
  });

  it("shows 0.0% coverage and empty state when an offering has no syllabus units", async () => {
    await openSyllabusTab(TENANT.riverside);

    const offeringSelect = (await screen.findByLabelText("Subject offering")) as HTMLSelectElement;
    fireEvent.change(offeringSelect, { target: { value: OFFERING.rvSouthYearSeven[0] } });

    expect(
      await screen.findByRole("heading", { name: "No syllabus units for this offering yet" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "0.0% (0 of 0)");
  });

  it("shows an error state and retries when loading syllabus units fails", async () => {
    server.use(
      http.get("*/api/v1/syllabus-units", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );
    await openSyllabusTab(TENANT.riverside);

    expect(
      await screen.findByRole("heading", { name: "Syllabus and coverage could not be loaded." }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Non-Fiction")).toBeInTheDocument();
  });
});
